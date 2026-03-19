const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

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

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const DEMO_MODE = `${process.env.DEMO_MODE ?? 'true'}`.toLowerCase() !== 'false';
const frontendDistPath = path.resolve(__dirname, '../frontend/dist');

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: false,
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, demo: DEMO_MODE });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WireGate backend listening on http://0.0.0.0:${PORT}`);
  console.log(`Frontend allowed origin: ${FRONTEND_URL}`);
  console.log(`Demo mode: ${DEMO_MODE}`);
});
