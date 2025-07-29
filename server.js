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

    // Set session immediately after signup
    req.session.user = { username, profile_picture: null };
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
    return res.status(401).json({ error: "Invalid login" });
  }

  req.session.user = {
    username: user.username,
    profile_picture: user.profile_picture
  };

  res.json({ success: true });
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
    return res.status(401).json({ error: 'Not authenticated' });
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


// WebSocket Chat Broadcast
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
});


// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
