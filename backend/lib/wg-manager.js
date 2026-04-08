const { execSync, spawn } = require('child_process');
const { upsertPeerInConfig, removePeerFromConfig } = require('./wg-config');

function getInterfaceName() {
  return process.env.WG_INTERFACE || 'wg0';
}

function withConnectionState(peer) {
  return {
    ...peer,
    connected: Boolean(peer.latestHandshake) && Date.now() - Number(peer.latestHandshake) < 3 * 60 * 1000,
  };
}

function runCommand(command) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const stdout = error.stdout?.toString()?.trim();
    const stderr = error.stderr?.toString()?.trim();
    throw new Error(stderr || stdout || error.message || 'WireGuard command failed');
  }
}

function spawnCommand(command, args, handlers = {}) {
  const { onData = () => {}, onEnd = () => {}, onError = () => {} } = handlers;
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => onData(chunk.toString()));
  child.stderr.on('data', (chunk) => onData(chunk.toString()));
  child.on('error', (error) => onError(error));
  child.on('close', (code) => {
    if (code === 0) {
      onEnd();
      return;
    }

    onError(new Error(`Command exited with code ${code}`));
  });

  return child;
}

function streamSequence(steps, handlers = {}) {
  const { onData = () => {}, onEnd = () => {}, onError = () => {} } = handlers;
  let currentStop = null;
  let index = 0;
  let stopped = false;

  const runNext = () => {
    if (stopped) {
      return;
    }

    if (index >= steps.length) {
      onEnd();
      return;
    }

    const step = steps[index];
    index += 1;

    currentStop = step({
      onData,
      onEnd: runNext,
      onError,
    });
  };

  runNext();

  return () => {
    stopped = true;
    if (typeof currentStop === 'function') {
      currentStop();
    } else if (currentStop?.kill) {
      currentStop.kill('SIGTERM');
    }
  };
}

function getStatus() {
  const iface = getInterfaceName();

  try {
    const output = runCommand(`sudo wg show ${iface}`);
    const publicKey = output.match(/public key:\s+(.+)/i)?.[1]?.trim() || '';
    const listenPort = Number(output.match(/listening port:\s+(\d+)/i)?.[1] || 0);

    return {
      interface: iface,
      running: true,
      listenPort,
      publicKey,
      subnet: process.env.WG_SUBNET || '10.0.0',
    };
  } catch {
    return {
      interface: iface,
      running: false,
      listenPort: Number(process.env.WG_SERVER_PORT) || 51820,
      publicKey: process.env.WG_SERVER_PUBLIC_KEY || '',
      subnet: process.env.WG_SUBNET || '10.0.0',
    };
  }
}

function getPeers() {
  const iface = getInterfaceName();

  try {
    const output = runCommand(`sudo wg show ${iface} dump`);
    const lines = output.split(/\r?\n/).filter(Boolean);

    return lines.slice(1).map((line) => {
      const [publicKey, , endpoint, allowedIPs, latestHandshake, rxBytes, txBytes] = line.split('\t');
      return withConnectionState({
        publicKey,
        endpoint: endpoint === '(none)' ? null : endpoint,
        allowedIPs,
        latestHandshake: Number(latestHandshake) * 1000,
        rxBytes: Number(rxBytes),
        txBytes: Number(txBytes),
      });
    });
  } catch {
    return [];
  }
}

function addPeer(publicKey, ip) {
  const iface = getInterfaceName();

  upsertPeerInConfig(iface, publicKey, `${ip}/32`);
  const output = runCommand(`sudo wg set ${iface} peer ${publicKey} allowed-ips ${ip}/32`);
  return { ok: true, output: [output].filter(Boolean).join('\n') || 'Peer added' };
}

function removePeer(publicKey) {
  const iface = getInterfaceName();

  removePeerFromConfig(iface, publicKey);
  const output = runCommand(`sudo wg set ${iface} peer ${publicKey} remove`);
  return { ok: true, output: [output].filter(Boolean).join('\n') || 'Peer removed' };
}

function startInterface() {
  const iface = getInterfaceName();

  const output = runCommand(`sudo wg-quick up ${iface}`);
  return { ok: true, output: output || `Started ${iface}` };
}

function stopInterface() {
  const iface = getInterfaceName();

  const output = runCommand(`sudo wg-quick down ${iface}`);
  return { ok: true, output: output || `Stopped ${iface}` };
}

function restartInterface() {
  const stopped = stopInterface();
  const started = startInterface();
  return { ok: true, output: [stopped.output, started.output].filter(Boolean).join('\n') };
}

function streamInterfaceAction(action, handlers = {}) {
  const iface = getInterfaceName();

  if (action === 'service-restart') {
    return streamSequence(
      [
        (stepHandlers) => spawnCommand('sudo', ['systemctl', 'restart', `wg-quick@${iface}`], stepHandlers),
        (stepHandlers) => spawnCommand('sudo', ['systemctl', 'status', `wg-quick@${iface}`, '--no-pager'], stepHandlers),
      ],
      handlers
    );
  }

  if (action === 'restart') {
    return streamSequence(
      [
        (stepHandlers) => spawnCommand('sudo', ['wg-quick', 'down', iface], stepHandlers),
        (stepHandlers) => spawnCommand('sudo', ['wg-quick', 'up', iface], stepHandlers),
      ],
      handlers
    );
  }

  if (action === 'start') {
    return spawnCommand('sudo', ['wg-quick', 'up', iface], handlers);
  }

  if (action === 'stop') {
    return spawnCommand('sudo', ['wg-quick', 'down', iface], handlers);
  }

  throw new Error('Unknown interface action');
}

module.exports = {
  getStatus,
  getPeers,
  addPeer,
  removePeer,
  startInterface,
  stopInterface,
  restartInterface,
  streamInterfaceAction,
};
