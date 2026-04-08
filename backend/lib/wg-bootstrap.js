const fs = require('fs');
const { execSync } = require('child_process');
const envStore = require('./env-store');
const store = require('./store');

function run(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: '/bin/bash',
  }).trim();
}

function runOptional(command) {
  try {
    return run(command);
  } catch {
    return '';
  }
}

function isLinux() {
  return process.platform === 'linux';
}

function isPlaceholder(value) {
  return !value || `${value}`.startsWith('YOUR_');
}

function getValue(name, fallback) {
  return process.env[name] || fallback;
}

function getPrimaryIp() {
  const detected = detectPublicIp();
  if (detected) {
    return detected;
  }

  return getLocalServerIp();
}

function getLocalServerIp() {
  return runOptional("hostname -I | awk '{print $1}'");
}

function extractIpv4(value) {
  const match = `${value || ''}`.match(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/);
  return match?.[0] || '';
}

function isPrivateIpv4(value) {
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(`${value || ''}`);
}

function detectPublicIp() {
  const candidates = [
    runOptional("curl -4 -fsSL https://api.ipify.org"),
    runOptional("curl -4 -fsSL https://ifconfig.me"),
    runOptional("wget -qO- https://api.ipify.org"),
    runOptional("dig +short myip.opendns.com @resolver1.opendns.com"),
  ];

  for (const candidate of candidates) {
    const ipv4 = extractIpv4(candidate);
    if (ipv4 && !isPrivateIpv4(ipv4)) {
      return ipv4;
    }
  }

  return '';
}

function getDefaultInterface() {
  return run("ip route show default | awk 'NR==1 {print $5}'");
}

function ensureIpForwarding() {
  fs.writeFileSync('/etc/sysctl.d/99-wiregate.conf', 'net.ipv4.ip_forward=1\n', 'utf8');
  run('sysctl --system >/dev/null');
}

function parsePrivateKeyFromConfig(configPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  const match = content.match(/^PrivateKey\s*=\s*(.+)$/m);
  return match?.[1]?.trim() || '';
}

function parseConfigValue(content, key) {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() || '';
}

function parseSubnetFromAddress(address) {
  const match = `${address || ''}`.match(/^(\d+\.\d+\.\d+)\.\d+\/\d+$/);
  return match?.[1] || '';
}

function updateConfigValue(content, key, value) {
  const pattern = new RegExp(`^${key}\\s*=\\s*.+$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, `${key} = ${value}`);
  }

  return `${content.trimEnd()}\n${key} = ${value}\n`;
}

function buildPostUp(iface, subnet, outboundIface, port) {
  return [
    `iptables -A INPUT -p udp --dport ${port} -j ACCEPT`,
    `iptables -A INPUT -i ${iface} -j ACCEPT`,
    `iptables -A FORWARD -i ${iface} -j ACCEPT`,
    `iptables -A FORWARD -o ${iface} -j ACCEPT`,
    `iptables -t nat -A POSTROUTING -s ${subnet}.0/24 -o ${outboundIface} -j MASQUERADE`,
  ].join('; ');
}

function buildPostDown(iface, subnet, outboundIface, port) {
  return [
    `iptables -D INPUT -p udp --dport ${port} -j ACCEPT`,
    `iptables -D INPUT -i ${iface} -j ACCEPT`,
    `iptables -D FORWARD -i ${iface} -j ACCEPT`,
    `iptables -D FORWARD -o ${iface} -j ACCEPT`,
    `iptables -t nat -D POSTROUTING -s ${subnet}.0/24 -o ${outboundIface} -j MASQUERADE`,
  ].join('; ');
}

function escapeRegExp(value) {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateSubnetReferences(content, previousSubnet, nextSubnet, iface, outboundIface, port) {
  let nextContent = content;

  if (previousSubnet && previousSubnet !== nextSubnet) {
    const oldAddressPattern = new RegExp(`Address\\s*=\\s*${escapeRegExp(previousSubnet)}\\.1/24`, 'm');
    nextContent = nextContent.replace(oldAddressPattern, `Address = ${nextSubnet}.1/24`);

    const oldCidrPattern = new RegExp(`${escapeRegExp(previousSubnet)}\\.0/24`, 'g');
    nextContent = nextContent.replace(oldCidrPattern, `${nextSubnet}.0/24`);
  }

  nextContent = updateConfigValue(nextContent, 'Address', `${nextSubnet}.1/24`);

  const postUp = buildPostUp(iface, nextSubnet, outboundIface, port);
  const postDown = buildPostDown(iface, nextSubnet, outboundIface, port);
  nextContent = updateConfigValue(nextContent, 'PostUp', postUp);
  nextContent = updateConfigValue(nextContent, 'PostDown', postDown);

  return nextContent;
}

function migrateUsersToSubnet(iface, previousSubnet, nextSubnet) {
  if (!previousSubnet || previousSubnet === nextSubnet) {
    return;
  }

  const users = store.getAll();

  users.forEach((user) => {
    const lastOctet = `${user.ip || ''}`.split('.').pop();
    if (!lastOctet || !/^\d+$/.test(lastOctet)) {
      return;
    }

    const nextIp = `${nextSubnet}.${lastOctet}`;
    store.replace(user.publicKey, {
      ...user,
      ip: nextIp,
    });

    try {
      run(`sudo wg set ${iface} peer ${user.publicKey} allowed-ips ${nextIp}/32`);
    } catch {
      // Ignore missing peers during migration; stored user IP is still updated.
    }
  });

  try {
    run(`sudo wg-quick save ${iface}`);
  } catch {
    // Ignore save failures here; the service restart will report problems visibly.
  }
}

function ensureWireguardInstalled() {
  try {
    run('command -v wg');
  } catch {
    run('apt update');
    run('apt install -y wireguard');
  }
}

function openFirewallPort(port) {
  const normalizedPort = Number(port);
  if (!Number.isFinite(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    return;
  }

  try {
    run(`iptables -C INPUT -p udp --dport ${normalizedPort} -j ACCEPT`);
  } catch {
    run(`iptables -I INPUT -p udp --dport ${normalizedPort} -j ACCEPT`);
  }

  try {
    run('command -v ufw >/dev/null 2>&1 && ufw --force allow ' + normalizedPort + '/udp');
  } catch {
    // Ignore ufw failures; raw iptables rule above is the hard requirement.
  }
}

function closeFirewallPort(port) {
  const normalizedPort = Number(port);
  if (!Number.isFinite(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    return;
  }

  try {
    run(`iptables -D INPUT -p udp --dport ${normalizedPort} -j ACCEPT`);
  } catch {
    // Ignore missing rules when the old port was never opened explicitly.
  }

  try {
    run('command -v ufw >/dev/null 2>&1 && ufw --force delete allow ' + normalizedPort + '/udp');
  } catch {
    // Ignore ufw failures; the next active port is opened explicitly.
  }
}

function isFirewallPortOpen(port) {
  const normalizedPort = Number(port);
  if (!Number.isFinite(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    return false;
  }

  try {
    run(`iptables -C INPUT -p udp --dport ${normalizedPort} -j ACCEPT`);
    return true;
  } catch {
    return false;
  }
}

function restartWireguardInterface(iface) {
  try {
    run(`systemctl restart wg-quick@${iface}`);
    return;
  } catch {
    try {
      run(`wg-quick down ${iface}`);
    } catch {
      // Ignore down failures and still attempt to bring the interface back up.
    }

    run(`wg-quick up ${iface}`);
  }
}

function ensureWireguardBootstrap() {
  if (!isLinux()) {
    throw new Error('Automatic WireGuard bootstrap only works on Linux servers.');
  }

  const autoSetup = `${process.env.AUTO_SETUP_WIREGUARD ?? 'true'}`.toLowerCase() !== 'false';
  if (!autoSetup) {
    throw new Error('AUTO_SETUP_WIREGUARD is disabled.');
  }

  ensureWireguardInstalled();
  ensureIpForwarding();

  const iface = getValue('WG_INTERFACE', 'wg0');
  const subnet = getValue('WG_SUBNET', '10.0.0');
  const port = getValue('WG_SERVER_PORT', '51820');
  const endpoint = process.env.WG_SERVER_ENDPOINT || '';
  const configPath = `/etc/wireguard/${iface}.conf`;
  const keyPath = `/etc/wireguard/${iface}.key`;
  const pubPath = `/etc/wireguard/${iface}.pub`;

  fs.mkdirSync('/etc/wireguard', { recursive: true, mode: 0o700 });

  let privateKey = '';
  let publicKey = '';

  if (fs.existsSync(configPath)) {
    privateKey = parsePrivateKeyFromConfig(configPath);
    if (privateKey) {
      publicKey = run(`printf '%s' '${privateKey}' | wg pubkey`);
    }

    const outboundIface = getDefaultInterface();
    if (!outboundIface) {
      throw new Error('Unable to detect the default outbound interface.');
    }

    const existingConfig = fs.readFileSync(configPath, 'utf8');
    const currentPort = parseConfigValue(existingConfig, 'ListenPort') || port;
    const currentSubnet = parseSubnetFromAddress(parseConfigValue(existingConfig, 'Address')) || subnet;
    const normalizedConfig = updateSubnetReferences(existingConfig, currentSubnet, currentSubnet, iface, outboundIface, currentPort);

    if (normalizedConfig !== existingConfig) {
      fs.writeFileSync(configPath, normalizedConfig, { encoding: 'utf8', mode: 0o600 });
    }

    openFirewallPort(currentPort);
  } else {
    const outboundIface = getDefaultInterface();
    if (!outboundIface) {
      throw new Error('Unable to detect the default outbound interface.');
    }

    privateKey = run('wg genkey');
    publicKey = run(`printf '%s' '${privateKey}' | wg pubkey`);
    fs.writeFileSync(keyPath, `${privateKey}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.writeFileSync(pubPath, `${publicKey}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.writeFileSync(
      configPath,
      [
        '[Interface]',
        `Address = ${subnet}.1/24`,
        `ListenPort = ${port}`,
        `PrivateKey = ${privateKey}`,
        'SaveConfig = true',
        `PostUp = ${buildPostUp(iface, subnet, outboundIface, port)}`,
        `PostDown = ${buildPostDown(iface, subnet, outboundIface, port)}`,
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 }
    );

    openFirewallPort(port);
    run(`systemctl enable --now wg-quick@${iface}`);
  }

  if (!publicKey) {
    throw new Error(`Unable to determine the WireGuard public key for ${iface}.`);
  }

  const nextEndpoint = isPlaceholder(endpoint) ? getPrimaryIp() : endpoint;
  envStore.updateEnvValues({
    WG_INTERFACE: iface,
    WG_SUBNET: subnet,
    WG_SERVER_PORT: port,
    WG_SERVER_PUBLIC_KEY: publicKey,
    WG_SERVER_ENDPOINT: nextEndpoint,
  });

  return {
    interface: iface,
    subnet,
    port,
    endpoint: nextEndpoint,
    publicKey,
    configPath,
  };
}

function applyWireguardServerConfig({ endpoint, port, subnet }) {
  if (!isLinux()) {
    throw new Error('WireGuard server configuration can only be applied on Linux servers.');
  }

  const bootstrap = ensureWireguardBootstrap();
  const iface = bootstrap.interface;
  const configPath = `/etc/wireguard/${iface}.conf`;
  const previousSubnet = process.env.WG_SUBNET || bootstrap.subnet;
  const previousPort = process.env.WG_SERVER_PORT || bootstrap.port;
  const nextValues = {};
  let nextPort = `${previousPort}`.trim();
  let nextSubnet = `${previousSubnet}`.trim();
  let needsInterfaceReload = false;

  if (endpoint) {
    nextValues.WG_SERVER_ENDPOINT = `${endpoint}`.trim();
  }

  if (port) {
    const normalizedPort = `${port}`.trim();
    nextValues.WG_SERVER_PORT = normalizedPort;
    nextPort = normalizedPort;
    needsInterfaceReload = normalizedPort !== `${previousPort}`.trim();
  }

  if (subnet) {
    const normalizedSubnet = `${subnet}`.trim();
    nextValues.WG_SUBNET = normalizedSubnet;
    nextSubnet = normalizedSubnet;
    needsInterfaceReload = needsInterfaceReload || normalizedSubnet !== `${previousSubnet}`.trim();
  }

  if (fs.existsSync(configPath)) {
    let updatedConfig = fs.readFileSync(configPath, 'utf8');

    if (port) {
      updatedConfig = updateConfigValue(updatedConfig, 'ListenPort', nextPort);
    }

    if (subnet) {
      const outboundIface = getDefaultInterface();
      if (!outboundIface) {
        throw new Error('Unable to detect the default outbound interface.');
      }

      updatedConfig = updateSubnetReferences(updatedConfig, previousSubnet, nextSubnet, iface, outboundIface, nextPort);
    } else if (port) {
      const outboundIface = getDefaultInterface();
      if (!outboundIface) {
        throw new Error('Unable to detect the default outbound interface.');
      }

      updatedConfig = updateConfigValue(updatedConfig, 'PostUp', buildPostUp(iface, previousSubnet, outboundIface, nextPort));
      updatedConfig = updateConfigValue(updatedConfig, 'PostDown', buildPostDown(iface, previousSubnet, outboundIface, nextPort));
    }

    fs.writeFileSync(configPath, updatedConfig, { encoding: 'utf8', mode: 0o600 });
  }

  if (Object.keys(nextValues).length > 0) {
    envStore.updateEnvValues(nextValues);
  }

  if (port) {
    openFirewallPort(nextPort);

    if (`${previousPort}`.trim() !== nextPort) {
      closeFirewallPort(previousPort);
    }
  }

  if (subnet) {
    migrateUsersToSubnet(iface, previousSubnet, nextSubnet);
  }

  if (needsInterfaceReload) {
    restartWireguardInterface(iface);
  }

  return {
    interface: iface,
    endpoint: process.env.WG_SERVER_ENDPOINT || bootstrap.endpoint,
    port: process.env.WG_SERVER_PORT || bootstrap.port,
    subnet: process.env.WG_SUBNET || bootstrap.subnet,
    publicKey: process.env.WG_SERVER_PUBLIC_KEY || bootstrap.publicKey,
  };
}

module.exports = {
  ensureWireguardBootstrap,
  applyWireguardServerConfig,
  detectPublicIp,
  getLocalServerIp,
  isFirewallPortOpen,
};
