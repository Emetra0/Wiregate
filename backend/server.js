const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { WebSocketServer } = require('ws');

const localEnvPath = path.resolve(__dirname, '.env');
const rootEnvPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const wireguardRoutes = require('./routes/wireguard');
const userRoutes = require('./routes/users');
const systemRoutes = require('./routes/system');
const terminalManager = require('./lib/terminal-manager');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: false,
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, demo: false });
});

app.use('/api/wireguard', wireguardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/system', systemRoutes);

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

wss.on('connection', (socket) => {
  let unsubscribe = null;

  try {
    unsubscribe = terminalManager.subscribe((event, payload) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ event, payload }));
      }
    });
  } catch (error) {
    socket.send(JSON.stringify({ event: 'error', payload: { error: error.message } }));
  }

  socket.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'input') {
        terminalManager.writeData(data.data || '');
        return;
      }

      if (data.type === 'resize') {
        terminalManager.resize(data.cols, data.rows);
        return;
      }

      if (data.type === 'interrupt') {
        terminalManager.interrupt();
        return;
      }

      if (data.type === 'clear') {
        terminalManager.clearOutput();
      }
    } catch (error) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ event: 'error', payload: { error: error.message } }));
      }
    }
  });

  socket.on('close', () => {
    unsubscribe?.();
  });
});

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/api/system/terminal/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WireGate backend listening on http://0.0.0.0:${PORT}`);
  console.log(`Frontend allowed origin: ${FRONTEND_URL}`);
  console.log('Mode: production');
});
