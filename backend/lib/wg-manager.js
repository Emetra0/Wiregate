const crypto = require('crypto');
const { execSync } = require('child_process');

function isDemoMode() {
  return `${process.env.DEMO_MODE ?? 'true'}`.toLowerCase() !== 'false';
}

function getInterfaceName() {
  return process.env.WG_INTERFACE || 'wg0';
}

function randomKey() {
  return crypto.randomBytes(32).toString('base64');
}

let demoPeers = [
  {
    publicKey: randomKey(),
    endpoint: '192.168.1.44:51820',
    allowedIPs: '10.0.0.2/32',
    latestHandshake: Date.now() - 45 * 1000,
    rxBytes: 4123456,
    txBytes: 932145,
  },
  {
    publicKey: randomKey(),
    endpoint: null,
    allowedIPs: '10.0.0.3/32',
    latestHandshake: Date.now() - 1000 * 60 * 42,
    rxBytes: 21045,
    txBytes: 10933,
  },
];

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

function getStatus() {
  const iface = getInterfaceName();

  if (isDemoMode()) {
    return {
      interface: iface,
      running: true,
      listenPort: Number(process.env.WG_SERVER_PORT) || 51820,
      publicKey: process.env.WG_SERVER_PUBLIC_KEY || 'demo-server-public-key-4rX2gX9b...=',
      subnet: process.env.WG_SUBNET || '10.0.0',
    };
  }

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

  if (isDemoMode()) {
    return demoPeers.map(withConnectionState);
  }

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

  if (isDemoMode()) {
    const peer = withConnectionState({
      publicKey,
      endpoint: null,
      allowedIPs: `${ip}/32`,
      latestHandshake: 0,
      rxBytes: 0,
      txBytes: 0,
    });
    demoPeers = [peer, ...demoPeers.filter((item) => item.publicKey !== publicKey)];
    return { ok: true, output: `Added demo peer ${publicKey} with ${ip}/32` };
  }

  const output = runCommand(`sudo wg set ${iface} peer ${publicKey} allowed-ips ${ip}/32`);
  const saveOutput = runCommand(`sudo wg-quick save ${iface}`);
  return { ok: true, output: [output, saveOutput].filter(Boolean).join('\n') || 'Peer added' };
}

function removePeer(publicKey) {
  const iface = getInterfaceName();

  if (isDemoMode()) {
    demoPeers = demoPeers.filter((item) => item.publicKey !== publicKey);
    return { ok: true, output: `Removed demo peer ${publicKey}` };
  }

  const output = runCommand(`sudo wg set ${iface} peer ${publicKey} remove`);
  const saveOutput = runCommand(`sudo wg-quick save ${iface}`);
  return { ok: true, output: [output, saveOutput].filter(Boolean).join('\n') || 'Peer removed' };
}

function startInterface() {
  const iface = getInterfaceName();

  if (isDemoMode()) {
    return { ok: true, output: `[#] ip link add ${iface} type wireguard\n[#] wg setconf ${iface} /dev/fd/63\n[#] ip link set up dev ${iface}` };
  }

  const output = runCommand(`sudo wg-quick up ${iface}`);
  return { ok: true, output: output || `Started ${iface}` };
}

function stopInterface() {
  const iface = getInterfaceName();

  if (isDemoMode()) {
    return { ok: true, output: `[#] ip link delete dev ${iface}\nInterface ${iface} stopped` };
  }

  const output = runCommand(`sudo wg-quick down ${iface}`);
  return { ok: true, output: output || `Stopped ${iface}` };
}

function restartInterface() {
  if (isDemoMode()) {
    const stopped = stopInterface();
    const started = startInterface();
    return { ok: true, output: `${stopped.output}\n${started.output}` };
  }

  const stopped = stopInterface();
  const started = startInterface();
  return { ok: true, output: [stopped.output, started.output].filter(Boolean).join('\n') };
}

module.exports = {
  getStatus,
  getPeers,
  addPeer,
  removePeer,
  startInterface,
  stopInterface,
  restartInterface,
};
