async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response;
}

export const api = {
  health: () => request('/api/health'),
  wgStatus: () => request('/api/wireguard/status'),
  wgPeers: () => request('/api/wireguard/peers'),
  wgStart: () => request('/api/wireguard/start', { method: 'POST' }),
  wgStop: () => request('/api/wireguard/stop', { method: 'POST' }),
  wgRestart: () => request('/api/wireguard/restart', { method: 'POST' }),
  getUsers: () => request('/api/users'),
  createUser: (body) =>
    request('/api/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteUser: (pubKey) =>
    request(`/api/users/${encodeURIComponent(pubKey)}`, {
      method: 'DELETE',
    }),
  regenerateUser: (pubKey) =>
    request(`/api/users/${encodeURIComponent(pubKey)}/regenerate`, {
      method: 'POST',
    }),
  system: () => request('/api/system'),
  async getQR(configString) {
    const response = await request('/api/users/qr', {
      method: 'POST',
      body: JSON.stringify({ config: configString }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
};
