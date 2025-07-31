const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const { pool } = require('./db');

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret', // use .env in production
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true if using HTTPS
}));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });


// SIGNUP (with session)
app.post('/api/signup', async (req, res) => {
  const { username, password, email } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (username, password, email) VALUES ($1, $2, $3)`,
      [username, hash, email]
    );

    // // Set session immediately after signup
    // req.session.user = { username, profile_picture: null };
    res.json({ success: true });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// LOGIN (with session)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.json({ error: "Invalid login" });
  }

  req.session.user = {
    username: user.username,
    profile_picture: user.profile_picture
  };

  res.json({
    success: true,
    username: user.username,
    profile_picture: user.profile_picture
  });
});


// LOGOUT (clear session)
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});


// CURRENT SESSION USER
app.get('/api/user', (req, res) => {
  if (!req.session.user) {
    return res.json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});


// GET USER BY USERNAME (public)
app.get('/api/user/:username', async (req, res) => {
  const result = await pool.query(
    `SELECT username, about, profile_picture FROM users WHERE username = $1`,
    [req.params.username]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
  res.json(result.rows[0]);
});


// get pending messages

// app.get('/api/messages', async (req, res) => {
//   const username = req.session?.user?.username;
//   if (!username) return res.status(401).json({ error: 'Not logged in' });

//   // Get all pending messages
//   const result = await pool.query(
//     `SELECT id, sender, ciphertext, image, time FROM messages WHERE recipient = $1`,
//     [username]
//   );

//   const ids = result.rows.map(row => row.id);

//   // Delete them immediately
//   if (ids.length > 0) {
//     await pool.query(
//       `DELETE FROM messages WHERE id = ANY($1::int[])`,
//       [ids]
//     );
//   }

//   res.json(result.rows);
// });


// // WebSocket Chat Broadcast
// wss.on('connection', (ws) => {
//   console.log('Client connected');

//   ws.on('message', (message) => {
//     wss.clients.forEach((client) => {
//       if (client.readyState === WebSocket.OPEN) {
//         client.send(message);
//       }
//     });
//   });
// });


// individual chats behavior


const userSockets = new Map();

wss.on('connection', (ws, req) => {
  console.log('Client connected');
  let username = null;

  ws.on('message', async (msg) => {
    const data = JSON.parse(msg);

    // Authentication
    if (data.type === 'auth') {
      username = data.username;
      userSockets.set(username, ws);
      console.log('Client authorized: ', username);

      // Send undelivered messages
      const result = await pool.query(
        `SELECT id, sender, ciphertext, image, time FROM messages WHERE recipient = $1`,
        [username]
      );

      for (const row of result.rows) {
        ws.send(JSON.stringify({
          type: 'message',
          from: row.sender,
          ciphertext: row.ciphertext,
          image: row.image,
          time: Number(row.time) || Date.now()
        }));

        // await pool.query(`UPDATE messages SET delivered = true WHERE id = $1`, [row.id]);
        await pool.query(`DELETE FROM messages WHERE id = $1`, [row.id]);

      }

      return;
    }

    // Message forwarding or storing
    if (data.type === 'message') {
      const { to, from, ciphertext, image, time } = data;

      const recipientSocket = userSockets.get(to);
      const outgoing = JSON.stringify({
        type: 'message',
        from: from,
        ciphertext: ciphertext,
        image: image,
        time: time
      });

      if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
        recipientSocket.send(outgoing);
      } else {
        await pool.query(
          `INSERT INTO messages (sender, recipient, ciphertext, image, time) VALUES ($1, $2, $3, $4, $5)`,
          [from, to, ciphertext, image, time]
        );
      }
    }
  });

  ws.on('close', () => {
    if (username) {
      userSockets.delete(username);
    }
  });
});




// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');

  // Stop accepting new HTTP connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    try {
      client.terminate(); // or client.close()
    } catch (err) {
      console.error('Error closing WebSocket:', err);
    }
  });
  wss.close(() => {
    console.log('WebSocket server closed');
  });

  // Close database connection pool
  pool.end(() => {
    console.log('PostgreSQL pool closed');
    process.exit(0);
  });
}

// Handle exit signals
process.on('SIGINT', shutdown);  // Ctrl+C
process.on('SIGTERM', shutdown); // kill or Docker stop
