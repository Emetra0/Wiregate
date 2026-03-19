import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Header from '../components/Header';
import { useToast } from '../components/Toast';

export default function NetworkPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [network, setNetwork] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.systemNetwork();
      setNetwork(result);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!network) {
      return;
    }

    setSaving(true);
    try {
      const result = await api.saveSystemNetwork({
        endpoint: network.endpoint,
        port: network.port,
        subnet: network.subnet,
      });
      setNetwork(result);
      showToast(result.message || 'Saved network settings', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <Header title="Network" subtitle="Public IP detection, WireGuard port, firewall rules, and router port-forwarding help." />

      {loading && !network ? <div className="card loading-card">Loading network settings…</div> : null}

      <div className="settings-grid">
        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Automatic public endpoint</h2>
              <p className="page-sub">The server detects its public IP automatically and uses it as the suggested VPN endpoint.</p>
            </div>
            <span className="badge badge-online">Auto detect</span>
          </div>

          <div className="details-grid">
            <div className="detail-item">
              <span className="meta-label">Detected public IP</span>
              <strong>{network?.detectedPublicIp || 'Not detected'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Server LAN IP</span>
              <strong>{network?.localServerIp || '--'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Protocol</span>
              <strong>{network?.protocol?.toUpperCase() || 'UDP'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Firewall rule</span>
              <strong>{network?.firewallOpen ? 'Open' : 'Not open yet'}</strong>
            </div>
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>WireGuard port and firewall</h2>
              <p className="page-sub">Edit the public endpoint, WireGuard port, and subnet here. Saving updates the server config and firewall rules.</p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="network-endpoint">
              Public IP or hostname
            </label>
            <input
              id="network-endpoint"
              className="input"
              value={network?.endpoint || ''}
              placeholder="Detected automatically from the server public IP"
              onChange={(event) => setNetwork((current) => ({ ...(current || {}), endpoint: event.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="network-port">
              WireGuard forwarded port
            </label>
            <input
              id="network-port"
              className="input"
              value={network?.port || ''}
              placeholder="51820"
              onChange={(event) => setNetwork((current) => ({ ...(current || {}), port: event.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="network-subnet">
              WireGuard subnet prefix
            </label>
            <input
              id="network-subnet"
              className="input"
              value={network?.subnet || ''}
              placeholder="10.0.0"
              onChange={(event) => setNetwork((current) => ({ ...(current || {}), subnet: event.target.value }))}
            />
          </div>

          <div className="button-row">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save network and firewall settings'}
            </button>
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Router port-forwarding guide</h2>
              <p className="page-sub">The server can open its own firewall, but your router port forward must point to this Ubuntu server.</p>
            </div>
            <span className="badge badge-online">Learn port forwarding</span>
          </div>

          <div className="details-grid">
            <div className="detail-item">
              <span className="meta-label">Forward this port</span>
              <strong>{network?.routerPortForwardPort || '--'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Forward to LAN IP</span>
              <strong>{network?.routerPortForwardTarget || '--'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Protocol</span>
              <strong>{network?.protocol?.toUpperCase() || 'UDP'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Public endpoint used by clients</span>
              <strong>{network?.endpoint || '--'}</strong>
            </div>
          </div>

          <div className="notice">
            In your router, create a UDP port-forward rule from the external port to the same port on the Ubuntu server LAN IP shown above. The website can update the server firewall automatically, but the router port forward must still be created on the router itself.
          </div>
        </div>
      </div>
    </div>
  );
}