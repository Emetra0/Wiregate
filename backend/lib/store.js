const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.join(dataDir, 'users.json');

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, '[]', 'utf8');
  }
}

function readAll() {
  ensureStore();
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    fs.writeFileSync(dataFile, '[]', 'utf8');
    return [];
  }
}

function writeAll(users) {
  ensureStore();
  fs.writeFileSync(dataFile, JSON.stringify(users, null, 2), 'utf8');
}

function getAll() {
  return readAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getByPublicKey(key) {
  return readAll().find((user) => user.publicKey === key) || null;
}

function add(user) {
  const users = readAll();
  users.push(user);
  writeAll(users);
  return user;
}

function remove(publicKey) {
  const users = readAll();
  const removedUser = users.find((user) => user.publicKey === publicKey) || null;
  const nextUsers = users.filter((user) => user.publicKey !== publicKey);
  writeAll(nextUsers);
  return removedUser;
}

function replace(publicKey, updatedUser) {
  const users = readAll();
  const nextUsers = users.map((user) => (user.publicKey === publicKey ? updatedUser : user));
  writeAll(nextUsers);
  return updatedUser;
}

function nextIP() {
  const subnet = process.env.WG_SUBNET || '10.0.0';
  const used = new Set(
    readAll()
      .map((user) => user.ip)
      .filter(Boolean)
  );

  for (let lastOctet = 2; lastOctet <= 254; lastOctet += 1) {
    const candidate = `${subnet}.${lastOctet}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('No free IP addresses available in the configured subnet');
}

module.exports = {
  getAll,
  getByPublicKey,
  add,
  remove,
  replace,
  nextIP,
};
