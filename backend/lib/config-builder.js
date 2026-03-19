function buildClientConfig({
  privateKey,
  ip,
  dns,
  serverPublicKey,
  serverEndpoint,
  serverPort,
}) {
  return `[Interface]\nPrivateKey = ${privateKey}\nAddress = ${ip}/24\nDNS = ${dns}\n\n[Peer]\nPublicKey = ${serverPublicKey}\nEndpoint = ${serverEndpoint}:${serverPort}\nAllowedIPs = 0.0.0.0/0\nPersistentKeepalive = 25\n`;
}

module.exports = {
  buildClientConfig,
};
