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

export default function Users() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [configState, setConfigState] = useState(null);
  const [form, setForm] = useState({ name: '', email: '' });
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
    setConfigState({ user, config, qrUrl: null });
  }, []);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.createUser(form);
      setAddOpen(false);
      setForm({ name: '', email: '' });
      openConfigModal(result.user, result.config);
      await loadUsers();
      showToast('User created', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = (user) => {
    const config = configCache[user.publicKey];
    if (!config) {
      showToast('Config is not stored. Regenerate keys to issue a new one.', 'info');
      return;
    }
    openConfigModal(user, config);
  };

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
              onDownload={handleDownload}
              onRegenerate={(selectedUser) => setConfirmState({ type: 'regenerate', user: selectedUser })}
              onDelete={(selectedUser) => setConfirmState({ type: 'delete', user: selectedUser })}
            />
          ))}
        </div>
      ) : !loading ? (
        <div className="card empty">
          <div className="empty-icon">⊕</div>
          <p>No VPN users yet. Add the first user to generate a config.</p>
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
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
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
            Save this config now. The private key is not stored and cannot be recovered.
          </div>
          <div className="config-modal-grid">
            <pre className="config-box">{configState.config}</pre>
            <div className="qr-panel">
              {configState.qrUrl ? (
                <img src={configState.qrUrl} alt="WireGuard config QR code" className="qr-image" />
              ) : (
                <div className="empty small-empty">Generating QR code…</div>
              )}
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
