const crypto = require('crypto');
const { execSync } = require('child_process');

function isDemoMode() {
  return `${process.env.DEMO_MODE ?? 'true'}`.toLowerCase() !== 'false';
}

function generateKeyPair() {
  if (isDemoMode()) {
    return {
      privateKey: crypto.randomBytes(32).toString('base64'),
      publicKey: crypto.randomBytes(32).toString('base64'),
    };
  }

  const privateKey = execSync('wg genkey', { encoding: 'utf8' }).trim();
  const publicKey = execSync(`printf "%s" "${privateKey}" | wg pubkey`, {
    encoding: 'utf8',
    shell: '/bin/bash',
  }).trim();

  return { privateKey, publicKey };
}

module.exports = {
  generateKeyPair,
};
