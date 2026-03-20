import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Header from '../components/Header';
import Modal from '../components/Modal';
import UserCard from '../components/UserCard';
import { useToast } from '../components/Toast';

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'user';
}

function downloadConfigFile(name, config) {
  const blob = new Blob([config], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `wireguard-${slugify(name)}.conf`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatLastSeen(user) {
  if (user.connected) {
    return 'Active now';
  }

  if (!user.lastOnlineAt) {
    return 'Never connected';
  }

  return new Date(user.lastOnlineAt).toLocaleString();
}

export default function Users() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [loadingConfigKey, setLoadingConfigKey] = useState('');
  const [configState, setConfigState] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [configCache, setConfigCache] = useState({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getUsers();
      setUsers(list);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    let active = true;
    let previousUrl = null;

    async function hydrateQr() {
      if (!configState?.config) {
        return;
      }

      try {
        const qrUrl = await api.getQR(configState.config);
        if (!active) {
          URL.revokeObjectURL(qrUrl);
          return;
        }
        previousUrl = qrUrl;
        setConfigState((current) => (current ? { ...current, qrUrl } : current));
      } catch (error) {
        showToast(error.message, 'error');
      }
    }

    hydrateQr();

    return () => {
      active = false;
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
    };
  }, [configState?.config, showToast]);

  const openConfigModal = useCallback((user, config) => {
    setConfigCache((current) => ({ ...current, [user.publicKey]: config }));
    setConfigState({ user, config, qrUrl: null, showConfigText: false });
  }, []);

  const getStoredConfig = useCallback(
    async (user) => {
      if (configCache[user.publicKey]) {
        return configCache[user.publicKey];
      }

      const result = await api.getUserConfig(user.publicKey);
      setConfigCache((current) => ({ ...current, [user.publicKey]: result.config }));
      return result.config;
    },
    [configCache]
  );

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.createUser(form);
      setAddOpen(false);
      setForm({ name: '' });
      openConfigModal(result.user, result.config);
      await loadUsers();
      showToast('User created', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShowQr = useCallback(
    async (user) => {
      setLoadingConfigKey(user.publicKey);
      try {
        const config = await getStoredConfig(user);
        openConfigModal(user, config);
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        setLoadingConfigKey('');
      }
    },
    [getStoredConfig, openConfigModal, showToast]
  );

  const handleDownload = useCallback(
    async (user) => {
      setLoadingConfigKey(user.publicKey);
      try {
        const config = await getStoredConfig(user);
        downloadConfigFile(user.name, config);
        showToast('Config downloaded', 'success');
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        setLoadingConfigKey('');
      }
    },
    [getStoredConfig, showToast]
  );

  const handleConfirmDelete = async () => {
    if (!confirmState?.user) return;
    setSubmitting(true);
    try {
      await api.deleteUser(confirmState.user.publicKey);
      setConfigCache((current) => {
        const next = { ...current };
        delete next[confirmState.user.publicKey];
        return next;
      });
      setConfirmState(null);
      await loadUsers();
      showToast('User removed', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRegenerate = async () => {
    if (!confirmState?.user) return;
    setSubmitting(true);
    try {
      const result = await api.regenerateUser(confirmState.user.publicKey);
      setConfirmState(null);
      openConfigModal(result.user, result.config);
      await loadUsers();
      showToast('Keys regenerated', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [users]
  );

  return (
    <div className="page">
      <Header
        title="Users"
        subtitle="Provision, revoke and reissue WireGuard client configs."
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setAddOpen(true)}>
            Add user
          </button>
        }
      />

      {loading ? <div className="card loading-card">Loading users…</div> : null}

      {sortedUsers.length ? (
        <div className="users-grid">
          {sortedUsers.map((user) => (
            <UserCard
              key={user.publicKey}
              user={user}
              busy={submitting || loadingConfigKey === user.publicKey}
              onShowQr={handleShowQr}
              onDownload={handleDownload}
              onRegenerate={(selectedUser) => setConfirmState({ type: 'regenerate', user: selectedUser })}
              onDelete={(selectedUser) => setConfirmState({ type: 'delete', user: selectedUser })}
            />
          ))}
        </div>
      ) : !loading ? (
        <div className="card empty">
          <div className="empty-icon">⊕</div>
          <p>No VPN users yet. Add the first user to generate a QR code and config.</p>
        </div>
      ) : null}

      {addOpen ? (
        <Modal
          title="Add user"
          onClose={() => !submitting && setAddOpen(false)}
          actions={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setAddOpen(false)} disabled={submitting}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="add-user-form" disabled={submitting}>
                Create
              </button>
            </>
          }
        >
          <form id="add-user-form" onSubmit={handleCreateUser}>
            <div className="form-group">
              <label className="form-label" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                className="input"
                value={form.name}
                onChange={(event) => setForm({ name: event.target.value })}
                required
              />
            </div>
          </form>
        </Modal>
      ) : null}

      {configState ? (
        <Modal
          title={`VPN Config for ${configState.user.name}`}
          size="large"
          onClose={() => setConfigState(null)}
          actions={
            <>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => downloadConfigFile(configState.user.name, configState.config)}
              >
                Download .conf file
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setConfigState(null)}>
                Close
              </button>
            </>
          }
        >
          <div className="notice warning-notice">
            QR codes stay available for saved users. Keep access to this page limited because anyone here can re-import the profile.
          </div>
          <div className="config-modal-grid qr-only-grid">
            <div className="qr-panel">
              {configState.qrUrl ? (
                <img src={configState.qrUrl} alt="WireGuard config QR code" className="qr-image" />
              ) : (
                <div className="empty small-empty">Generating QR code…</div>
              )}
            </div>
            <div className="config-summary-panel">
              <div className="config-summary-card">
                <span className="meta-label">User</span>
                <strong>{configState.user.name}</strong>
              </div>
              <div className="config-summary-card">
                <span className="meta-label">VPN IP</span>
                <strong className="mono-text accent-text">{configState.user.ip}</strong>
              </div>
              <div className="config-summary-card">
                <span className="meta-label">Last online</span>
                <strong>{formatLastSeen(configState.user)}</strong>
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setConfigState((current) => ({ ...current, showConfigText: !current.showConfigText }))}
              >
                {configState.showConfigText ? 'Hide config text' : 'Reveal config text'}
              </button>
              {configState.showConfigText ? <pre className="config-box config-box-revealed">{configState.config}</pre> : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmState ? (
        <Modal
          title={confirmState.type === 'delete' ? `Remove ${confirmState.user.name}?` : `Regenerate keys for ${confirmState.user.name}?`}
          onClose={() => !submitting && setConfirmState(null)}
          actions={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setConfirmState(null)} disabled={submitting}>
                Cancel
              </button>
              <button
                className={`btn ${confirmState.type === 'delete' ? 'btn-danger' : 'btn-amber'}`}
                type="button"
                onClick={confirmState.type === 'delete' ? handleConfirmDelete : handleConfirmRegenerate}
                disabled={submitting}
              >
                {confirmState.type === 'delete' ? 'Delete' : 'Regenerate'}
              </button>
            </>
          }
        >
          <p className="page-sub confirmation-copy">
            {confirmState.type === 'delete'
              ? `This will revoke ${confirmState.user.name}'s VPN access immediately.`
              : `This will disconnect ${confirmState.user.name} immediately and they will need to re-import a new config.`}
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
