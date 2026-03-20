const express = require('express');
const QRCode = require('qrcode');
const store = require('../lib/store');
const { generateKeyPair } = require('../lib/key-gen');
const { buildClientConfig } = require('../lib/config-builder');
const wgManager = require('../lib/wg-manager');

const router = express.Router();

function sanitizeUser(user) {
  const { clientConfig, ...safeUser } = user;
  return safeUser;
}

function buildUserResponse(user, peer) {
  const storedLastOnlineAt = Number(user.lastOnlineAt || user.latestHandshake || 0);
  const peerLatestHandshake = Number(peer?.latestHandshake || 0);
  const lastOnlineAt = peerLatestHandshake || storedLastOnlineAt;

  return {
    ...sanitizeUser(user),
    endpoint: peer?.endpoint ?? null,
    allowedIPs: peer?.allowedIPs ?? `${user.ip}/32`,
    latestHandshake: peerLatestHandshake,
    lastOnlineAt,
    rxBytes: peer?.rxBytes ?? 0,
    txBytes: peer?.txBytes ?? 0,
    connected: peer?.connected ?? false,
  };
}

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
    const updates = [];

    const merged = users.map((user) => {
      const peer = peerMap.get(user.publicKey);
      const peerLatestHandshake = Number(peer?.latestHandshake || 0);

      if (peerLatestHandshake && peerLatestHandshake !== Number(user.lastOnlineAt || 0)) {
        updates.push({
          publicKey: user.publicKey,
          user: {
            ...user,
            lastOnlineAt: peerLatestHandshake,
            latestHandshake: peerLatestHandshake,
          },
        });
      }

      return buildUserResponse(user, peer);
    });

    updates.forEach(({ publicKey, user }) => {
      store.replace(publicKey, user);
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
    const config = buildUserConfig(privateKey, ip);
    wgManager.addPeer(publicKey, ip);

    const user = {
      id: Date.now().toString(),
      name,
      email,
      publicKey,
      ip,
      createdAt: new Date().toISOString(),
      latestHandshake: 0,
      lastOnlineAt: 0,
      clientConfig: config,
    };

    store.add(user);

    return res.status(201).json({
      user: buildUserResponse(user),
      config,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:publicKey/config', (req, res) => {
  try {
    const user = store.getByPublicKey(req.params.publicKey);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.clientConfig) {
      return res.status(404).json({ error: 'Config is not stored for this user. Regenerate keys to create a new one.' });
    }

    return res.json({
      user: sanitizeUser(user),
      config: user.clientConfig,
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
    const config = buildUserConfig(privateKey, existingUser.ip);
    wgManager.removePeer(existingUser.publicKey);
    wgManager.addPeer(publicKey, existingUser.ip);

    const updatedUser = {
      ...existingUser,
      publicKey,
      latestHandshake: 0,
      lastOnlineAt: 0,
      clientConfig: config,
    };

    store.replace(existingUser.publicKey, updatedUser);

    return res.json({
      user: buildUserResponse(updatedUser),
      config,
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
