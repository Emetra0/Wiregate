const { execSync } = require('child_process');

function generateKeyPair() {
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
