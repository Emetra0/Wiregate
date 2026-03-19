const express = require('express');
const QRCode = require('qrcode');
const store = require('../lib/store');
const { generateKeyPair } = require('../lib/key-gen');
const { buildClientConfig } = require('../lib/config-builder');
const wgManager = require('../lib/wg-manager');

const router = express.Router();

function buildUserConfig(privateKey, ip) {
  return buildClientConfig({
    privateKey,
    ip,
    dns: process.env.WG_DNS || '1.1.1.1',
    serverPublicKey: process.env.WG_SERVER_PUBLIC_KEY || 'REPLACE_SERVER_PUBLIC_KEY',
    serverEndpoint: process.env.WG_SERVER_ENDPOINT || '127.0.0.1',
    serverPort: process.env.WG_SERVER_PORT || '51820',
  });
}

router.get('/', (_req, res) => {
  try {
    const users = store.getAll();
    const peers = wgManager.getPeers();
    const peerMap = new Map(peers.map((peer) => [peer.publicKey, peer]));

    const merged = users.map((user) => {
      const peer = peerMap.get(user.publicKey);
      return {
        ...user,
        endpoint: peer?.endpoint ?? null,
        allowedIPs: peer?.allowedIPs ?? `${user.ip}/32`,
        latestHandshake: peer?.latestHandshake ?? 0,
        rxBytes: peer?.rxBytes ?? 0,
        txBytes: peer?.txBytes ?? 0,
        connected: peer?.connected ?? false,
      };
    });

    res.json(merged);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const name = `${req.body?.name || ''}`.trim();
    const email = `${req.body?.email || ''}`.trim();

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const { privateKey, publicKey } = generateKeyPair();
    const ip = store.nextIP();
    wgManager.addPeer(publicKey, ip);

    const user = {
      id: Date.now().toString(),
      name,
      email,
      publicKey,
      ip,
      createdAt: new Date().toISOString(),
    };

    store.add(user);

    return res.status(201).json({
      user: {
        ...user,
        connected: false,
        latestHandshake: 0,
        rxBytes: 0,
        txBytes: 0,
      },
      config: buildUserConfig(privateKey, ip),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/qr', async (req, res) => {
  try {
    const config = `${req.body?.config || ''}`;
    if (!config.trim()) {
      return res.status(400).json({ error: 'Config is required' });
    }

    const pngBuffer = await QRCode.toBuffer(config, {
      type: 'png',
      margin: 1,
      width: 320,
    });

    res.setHeader('Content-Type', 'image/png');
    return res.send(pngBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:publicKey/regenerate', (req, res) => {
  try {
    const currentKey = req.params.publicKey;
    const existingUser = store.getByPublicKey(currentKey);

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { privateKey, publicKey } = generateKeyPair();
    wgManager.removePeer(existingUser.publicKey);
    wgManager.addPeer(publicKey, existingUser.ip);

    const updatedUser = {
      ...existingUser,
      publicKey,
    };

    store.remove(existingUser.publicKey);
    store.add(updatedUser);

    return res.json({
      user: {
        ...updatedUser,
        connected: false,
        latestHandshake: 0,
        rxBytes: 0,
        txBytes: 0,
      },
      config: buildUserConfig(privateKey, existingUser.ip),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/:publicKey', (req, res) => {
  try {
    const publicKey = req.params.publicKey;
    const removedUser = store.getByPublicKey(publicKey);

    if (!removedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    wgManager.removePeer(publicKey);
    store.remove(publicKey);

    return res.json({ ok: true, user: removedUser });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
