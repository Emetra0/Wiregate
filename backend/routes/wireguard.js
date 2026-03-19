const express = require('express');
const wgManager = require('../lib/wg-manager');

const router = express.Router();

router.get('/status', (_req, res) => {
  try {
    res.json(wgManager.getStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/peers', (_req, res) => {
  try {
    res.json(wgManager.getPeers());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/start', (_req, res) => {
  try {
    res.json(wgManager.startInterface());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop', (_req, res) => {
  try {
    res.json(wgManager.stopInterface());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/restart', (_req, res) => {
  try {
    res.json(wgManager.restartInterface());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
