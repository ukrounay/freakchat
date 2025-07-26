const express = require('express');
const fetch = require('node-fetch'); 
const http = require('http');
const WebSocket = require('ws');


const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });



// Proxy

app.use(express.json());

app.get('/api/user', async (req, res) => {
  const username = req.query.username;
  if (!username) {
    return res.status(400).json({ error: 'Missing username' });
  }

  try {
    const externalRes = await fetch(`https://nemeleon.free.nf/chat_api/user.php?username=${encodeURIComponent(username)}`);
    if (!externalRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch external API' });
    }
    const data = await externalRes.json();
    res.json(data);
  } catch (err) {
    console.error('Proxy fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  try {
    const loginRes = await fetch('https://nemeleon.free.nf/chat_api/login.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ username, password })
    });

    const data = await loginRes.json();
    res.status(loginRes.status).json(data);
  } catch (err) {
    console.error('Login proxy error:', err);
    res.status(500).json({ error: 'Login failed due to server error' });
  }
});




// Web Socket

app.use(express.static('public'));

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

server.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
