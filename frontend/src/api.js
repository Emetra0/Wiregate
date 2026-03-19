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
  systemConfig: () => request('/api/system/config'),
  saveSystemConfig: (body) =>
    request('/api/system/config', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateStatus: () => request('/api/system/update'),
  startUpdate: (body = {}) =>
    request('/api/system/update', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  systemCommands: () => request('/api/system/commands'),
  runSystemCommand: (commandId) =>
    request(`/api/system/commands/${encodeURIComponent(commandId)}`, {
      method: 'POST',
    }),
  systemTerminal: () => request('/api/system/terminal'),
  sendSystemTerminalInput: (input) =>
    request('/api/system/terminal/input', {
      method: 'POST',
      body: JSON.stringify({ input }),
    }),
  interruptSystemTerminal: () =>
    request('/api/system/terminal/interrupt', {
      method: 'POST',
    }),
  clearSystemTerminal: () =>
    request('/api/system/terminal/clear', {
      method: 'POST',
    }),
  streamSystemTerminal(handlers = {}) {
    const source = new EventSource('/api/system/terminal/stream');
    let ended = false;

    source.addEventListener('snapshot', (event) => {
      const data = JSON.parse(event.data);
      handlers.onSnapshot?.(data);
    });

    source.addEventListener('chunk', (event) => {
      const data = JSON.parse(event.data);
      handlers.onChunk?.(data.chunk);
    });

    source.addEventListener('clear', () => {
      handlers.onClear?.();
    });

    source.addEventListener('exit', (event) => {
      ended = true;
      const data = JSON.parse(event.data);
      handlers.onExit?.(data);
      source.close();
    });

    source.onerror = () => {
      if (ended) {
        return;
      }
      handlers.onError?.(new Error('Terminal stream disconnected unexpectedly'));
    };

    return () => {
      ended = true;
      source.close();
    };
  },
  streamWireguardAction(action, handlers = {}) {
    const source = new EventSource(`/api/wireguard/stream/${encodeURIComponent(action.toLowerCase())}`);
    let ended = false;

    source.addEventListener('chunk', (event) => {
      const data = JSON.parse(event.data);
      handlers.onChunk?.(data.chunk);
    });

    source.addEventListener('end', (event) => {
      ended = true;
      const data = JSON.parse(event.data);
      handlers.onEnd?.(data);
      source.close();
    });

    source.addEventListener('error', (event) => {
      ended = true;
      try {
        const data = JSON.parse(event.data);
        handlers.onError?.(new Error(data.error || 'Streaming request failed'));
      } catch {
        handlers.onError?.(new Error('Streaming request failed'));
      }
      source.close();
    });

    source.onerror = () => {
      if (ended) {
        return;
      }
      handlers.onError?.(new Error('Streaming connection closed unexpectedly'));
      source.close();
    };

    return () => {
      ended = true;
      source.close();
    };
  },
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
