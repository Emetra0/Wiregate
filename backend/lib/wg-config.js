const fs = require('fs');

function getConfigPath(iface) {
  return `/etc/wireguard/${iface}.conf`;
}

function readConfigContent(iface) {
  const configPath = getConfigPath(iface);
  if (!fs.existsSync(configPath)) {
    return '';
  }

  return fs.readFileSync(configPath, 'utf8');
}

function writeConfigContent(iface, content) {
  fs.writeFileSync(getConfigPath(iface), content, { encoding: 'utf8', mode: 0o600 });
}

function parseSections(content) {
  const normalized = `${content || ''}`.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const sections = [];
  let current = null;

  lines.forEach((line) => {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      if (current) {
        sections.push(current);
      }

      current = {
        header: line.trim(),
        lines: [line.trim()],
      };
      return;
    }

    if (!current) {
      current = {
        header: null,
        lines: [],
      };
    }

    current.lines.push(line);
  });

  if (current) {
    sections.push(current);
  }

  return sections.filter((section) => section.lines.some((line) => line.trim() !== ''));
}

function serializeSections(sections) {
  return `${sections
    .map((section) => section.lines.join('\n').trimEnd())
    .filter(Boolean)
    .join('\n\n')
    .trim()}\n`;
}

function getSectionValue(section, key) {
  const match = section.lines.find((line) => new RegExp(`^${key}\\s*=\\s*`).test(line.trim()));
  return match?.split('=').slice(1).join('=').trim() || '';
}

function setSectionValue(section, key, value) {
  const pattern = new RegExp(`^${key}\\s*=\\s*`);
  const nextLines = [...section.lines];
  const lineIndex = nextLines.findIndex((line, index) => index > 0 && pattern.test(line.trim()));
  const serialized = `${key} = ${value}`;

  if (lineIndex >= 0) {
    nextLines[lineIndex] = serialized;
  } else {
    nextLines.push(serialized);
  }

  section.lines = nextLines;
  return section;
}

function findPeerSectionIndex(sections, publicKey) {
  return sections.findIndex((section) => section.header === '[Peer]' && getSectionValue(section, 'PublicKey') === publicKey);
}

function upsertPeerInConfig(iface, publicKey, allowedIp) {
  const sections = parseSections(readConfigContent(iface));
  const nextAllowedIp = `${allowedIp}`.includes('/') ? `${allowedIp}` : `${allowedIp}/32`;
  const existingIndex = findPeerSectionIndex(sections, publicKey);

  if (existingIndex >= 0) {
    const current = sections[existingIndex];
    setSectionValue(current, 'PublicKey', publicKey);
    setSectionValue(current, 'AllowedIPs', nextAllowedIp);
    sections[existingIndex] = current;
  } else {
    sections.push({
      header: '[Peer]',
      lines: ['[Peer]', `PublicKey = ${publicKey}`, `AllowedIPs = ${nextAllowedIp}`],
    });
  }

  writeConfigContent(iface, serializeSections(sections));
}

function removePeerFromConfig(iface, publicKey) {
  const sections = parseSections(readConfigContent(iface));
  const existingIndex = findPeerSectionIndex(sections, publicKey);

  if (existingIndex < 0) {
    return;
  }

  sections.splice(existingIndex, 1);
  writeConfigContent(iface, serializeSections(sections));
}

module.exports = {
  getConfigPath,
  readConfigContent,
  writeConfigContent,
  upsertPeerInConfig,
  removePeerFromConfig,
};