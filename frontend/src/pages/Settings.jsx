import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Header from '../components/Header';
import { useToast } from '../components/Toast';

export default function Settings({ onStatusChange }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [updateState, setUpdateState] = useState(null);
  const [commandState, setCommandState] = useState(null);
  const [terminalOutput, setTerminalOutput] = useState('Ready.');
  const [busyAction, setBusyAction] = useState('');
  const [configBusy, setConfigBusy] = useState(false);
  const [commandBusy, setCommandBusy] = useState('');
  const [updateBusy, setUpdateBusy] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextCommands, nextUpdateState, nextConfig] = await Promise.all([
        api.wgStatus(),
        api.systemCommands(),
        api.updateStatus(),
        api.systemConfig(),
      ]);
      setStatus(nextStatus);
      setCommandState(nextCommands);
      setUpdateState(nextUpdateState);
      setConfig(nextConfig);
      onStatusChange?.(nextStatus);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [onStatusChange, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!updateState?.running) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      try {
        const nextUpdateState = await api.updateStatus();
        setUpdateState(nextUpdateState);
      } catch (error) {
        showToast(error.message, 'error');
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [showToast, updateState?.running]);

  const copyPublicKey = async () => {
    try {
      await navigator.clipboard.writeText(status?.publicKey || '');
      showToast('Server public key copied', 'success');
    } catch {
      showToast('Clipboard access failed', 'error');
    }
  };

  const handleControl = async (action) => {
    setBusyAction(action);
    setTerminalOutput(`$ wg-quick ${action.toLowerCase() === 'restart' ? 'down/up' : action.toLowerCase()} ${status?.interface || 'wg0'}\n`);
    try {
      await new Promise((resolve, reject) => {
        api.streamWireguardAction(action, {
          onChunk: (chunk) => {
            setTerminalOutput((current) => `${current}${chunk}`);
          },
          onEnd: resolve,
          onError: reject,
        });
      });

      showToast(`WireGuard ${action.toLowerCase()} complete`, 'success');
      await load();
    } catch (error) {
      setTerminalOutput((current) => `${current}\n[error] ${error.message}`);
      showToast(error.message, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const handlePresetCommand = async (commandId) => {
    setCommandBusy(commandId);
    setTerminalOutput(`$ preset:${commandId}\n`);
    try {
      const result = await api.runSystemCommand(commandId);
      setTerminalOutput((result.output || 'Command completed with no output.').trim());
      showToast(`${result.label} complete`, 'success');
    } catch (error) {
      setTerminalOutput(`[error] ${error.message}`);
      showToast(error.message, 'error');
    } finally {
      setCommandBusy('');
    }
  };

  const handleSaveEndpoint = async () => {
    if (!config?.endpoint?.trim()) {
      showToast('Public IP or hostname is required', 'error');
      return;
    }

    if (!config?.port?.toString().trim()) {
      showToast('Forwarded WireGuard port is required', 'error');
      return;
    }

    setConfigBusy(true);
    try {
      const result = await api.saveSystemConfig({
        endpoint: config.endpoint.trim(),
        port: `${config.port}`.trim(),
      });
      setConfig(result);
      showToast(result.message || 'Saved server network settings', 'success');
      await load();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setConfigBusy(false);
    }
  };

  const handleStartUpdate = async (forceInstall = false) => {
    if (forceInstall) {
      setRepairBusy(true);
    } else {
      setUpdateBusy(true);
    }

    try {
      const result = await api.startUpdate({ forceInstall });
      showToast(result.message || 'Update started', 'success');
      const nextUpdateState = await api.updateStatus();
      setUpdateState(nextUpdateState);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      if (forceInstall) {
        setRepairBusy(false);
      } else {
        setUpdateBusy(false);
      }
    }
  };

  return (
    <div className="page">
      <Header title="Settings" subtitle="Read-only server settings and WireGuard interface controls." />

      <div className="settings-grid">
        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Server network settings</h2>
              <p className="page-sub">Set the public IP or hostname and the forwarded WireGuard port, then apply them directly to the server.</p>
            </div>
            <span className="badge badge-online">Production only</span>
          </div>

          <div className="mode-card-grid">
            <div className="detail-item">
              <span className="meta-label">Interface target</span>
              <strong>{config?.interface || status?.interface || '--'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Current endpoint</span>
              <strong>{config?.endpoint || 'Not configured'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Current forwarded port</span>
              <strong>{config?.port || status?.listenPort || '--'}</strong>
            </div>
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Apply public endpoint and port</h2>
              <p className="page-sub">These values are written into the server config and applied when you save.</p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="server-endpoint">
              Public IP or hostname
            </label>
            <input
              id="server-endpoint"
              className="input"
              placeholder="203.0.113.10 or vpn.example.com"
              value={config?.endpoint || ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...(current || {}),
                  endpoint: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="server-port">
              Forwarded WireGuard port
            </label>
            <input
              id="server-port"
              className="input"
              placeholder="51820"
              value={config?.port || ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...(current || {}),
                  port: event.target.value,
                }))
              }
            />
          </div>

          <div className="button-row">
            <button className="btn btn-primary" type="button" onClick={handleSaveEndpoint} disabled={configBusy}>
              {configBusy ? 'Saving…' : 'Save and apply network settings'}
            </button>
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Server info</h2>
              <p className="page-sub">Edit server config in the .env file on the host.</p>
            </div>
          </div>

          {loading && !status ? <div className="loading-card">Loading server info…</div> : null}

          <div className="details-grid">
            <div className="detail-item">
              <span className="meta-label">Interface name</span>
              <strong>{status?.interface || '--'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Listen port</span>
              <strong>{status?.listenPort || '--'}</strong>
            </div>
            <div className="detail-item detail-span">
              <span className="meta-label">Server public key</span>
              <button className="copy-field" type="button" onClick={copyPublicKey}>
                <span className="mono-text">{status?.publicKey || 'Unavailable'}</span>
                <span className="copy-hint">Click to copy</span>
              </button>
            </div>
            <div className="detail-item">
              <span className="meta-label">Subnet</span>
              <strong>{status?.subnet ? `${status.subnet}.0/24` : '--'}</strong>
            </div>
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>WireGuard interface controls</h2>
              <p className="page-sub">Start, stop or restart the active interface with live terminal output.</p>
            </div>
          </div>

          <div className="button-row">
            <button className="btn btn-success" type="button" disabled={!!busyAction} onClick={() => handleControl('Start')}>
              Start
            </button>
            <button className="btn btn-danger" type="button" disabled={!!busyAction} onClick={() => handleControl('Stop')}>
              Stop
            </button>
            <button className="btn btn-amber" type="button" disabled={!!busyAction} onClick={() => handleControl('Restart')}>
              Restart
            </button>
          </div>

          <pre className="terminal">{terminalOutput}</pre>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Local command presets</h2>
              <p className="page-sub">Run safe server-side admin commands from the panel.</p>
            </div>
            <span className={`badge ${commandState?.enabled ? 'badge-online' : 'badge-offline'}`}>
              {commandState?.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          {!commandState?.enabled ? (
            <div className="notice">
              Set `ENABLE_COMMAND_CENTER=true` in `.env` to enable preset terminal commands from the web UI.
            </div>
          ) : (
            <div className="command-grid">
              {commandState?.commands?.map((command) => (
                <button
                  key={command.id}
                  className="command-card"
                  type="button"
                  onClick={() => handlePresetCommand(command.id)}
                  disabled={!!commandBusy}
                >
                  <span className="command-title">{command.label}</span>
                  <span className="command-copy">{command.description}</span>
                  <span className="command-meta">{commandBusy === command.id ? 'Running…' : 'Run preset'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Update WireGate</h2>
              <p className="page-sub">Use the buttons below to rerun the Ubuntu installer so the latest site build and server setup are applied again.</p>
            </div>
            <span className={`badge ${updateState?.running ? 'badge-online' : 'badge-offline'}`}>
              {updateState?.running ? 'Updating' : updateState?.status || 'Idle'}
            </span>
          </div>

          <div className="button-row">
            <button className="btn btn-primary" type="button" onClick={() => handleStartUpdate(false)} disabled={updateBusy || repairBusy || updateState?.running}>
              {updateBusy || updateState?.running ? 'Installer running…' : 'Run installer update'}
            </button>
            <button className="btn btn-amber" type="button" onClick={() => handleStartUpdate(true)} disabled={updateBusy || repairBusy || updateState?.running}>
              {repairBusy || updateState?.running ? 'Repair running…' : 'Run installer repair'}
            </button>
          </div>

          <div className="update-meta-grid">
            <div className="detail-item">
              <span className="meta-label">Last update state</span>
              <strong>{updateState?.status || '--'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Update available</span>
              <strong>
                {typeof updateState?.updateAvailable === 'boolean'
                  ? updateState.updateAvailable
                    ? 'Yes'
                    : 'No'
                  : 'Unknown'}
              </strong>
            </div>
            <div className="detail-item detail-span">
              <span className="meta-label">Latest message</span>
              <strong>{updateState?.message || 'No update started yet.'}</strong>
            </div>
          </div>

          <pre className="terminal update-terminal">{updateState?.log || 'No update log yet.'}</pre>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>About</h2>
              <p className="page-sub">Project information and external resources.</p>
            </div>
          </div>

          <div className="about-list">
            <div className="detail-item">
              <span className="meta-label">Version</span>
              <strong>v1.0.0</strong>
            </div>
            <a className="resource-link" href="https://github.com" target="_blank" rel="noreferrer">
              GitHub repository
            </a>
            <a className="resource-link" href="https://www.wireguard.com" target="_blank" rel="noreferrer">
              WireGuard documentation
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
