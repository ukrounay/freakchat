const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const { pool } = require('./db');

// const fetch = (...args) =>
//   import('node-fetch').then(({ default: fetch }) => fetch(...args));

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Session (super simple for demo)
const sessions = new Map();

// SIGNUP
app.post('/api/signup', async (req, res) => {
  const { username, password, email } = req.body;

  const hash = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      `INSERT INTO users (username, password, email) VALUES ($1, $2, $3)`,
      [username, hash, email]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid login" });
  }

  const token = crypto.randomUUID();
  sessions.set(token, user.username);
  res.cookie('token', token, { httpOnly: true });
  res.json({ success: true });
});

// LOGOUT
app.post('/api/logout', (req, res) => {
  const token = req.cookies.token;
  sessions.delete(token);
  res.clearCookie('token');
  res.json({ success: true });
});

// CURRENT USER
app.get('/api/me', async (req, res) => {
  const username = sessions.get(req.cookies.token);
  if (!username) return res.status(401).json({ error: "Not logged in" });

  const result = await pool.query(`SELECT username, email, about, profile_picture FROM users WHERE username = $1`, [username]);
  res.json(result.rows[0]);
});

// GET USER BY USERNAME
app.get('/api/user/:username', async (req, res) => {
  const result = await pool.query(`SELECT username, about, profile_picture FROM users WHERE username = $1`, [req.params.username]);
  if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
  res.json(result.rows[0]);
});





// Web Socket

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
