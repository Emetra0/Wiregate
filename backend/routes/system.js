const express = require('express');
const os = require('os');

const router = express.Router();

function isDemoMode() {
  return `${process.env.DEMO_MODE ?? 'true'}`.toLowerCase() !== 'false';
}

router.get('/', (_req, res) => {
  try {
    if (isDemoMode()) {
      return res.json({
        uptime: 60 * 60 * 24 * 3 + 60 * 60 * 7 + 60 * 42,
        hostname: 'wiregate-demo',
        platform: 'linux',
        memTotal: 8 * 1024 * 1024 * 1024,
        memFree: 5.2 * 1024 * 1024 * 1024,
        loadAvg: [0.18, 0.26, 0.31],
      });
    }

    return res.json({
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform: os.platform(),
      memTotal: os.totalmem(),
      memFree: os.freemem(),
      loadAvg: os.loadavg(),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
