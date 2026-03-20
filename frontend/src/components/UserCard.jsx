function truncateKey(value) {
  if (!value) return 'Unavailable';
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
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

export default function UserCard({ user, busy = false, onShowQr, onDownload, onRegenerate, onDelete }) {
  return (
    <div className="card user-card">
      <div className="user-card-top">
        <div>
          <h3>{user.name}</h3>
          <p className="muted-text">Added {new Date(user.createdAt).toLocaleString()}</p>
        </div>
        <span className={`badge ${user.connected ? 'badge-online' : 'badge-offline'}`}>
          {user.connected ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="user-meta-list">
        <div>
          <span className="meta-label">VPN IP</span>
          <span className="mono-text accent-text">{user.ip}</span>
        </div>
        <div>
          <span className="meta-label">Public key</span>
          <span className="mono-text muted-text">{truncateKey(user.publicKey)}</span>
        </div>
        <div>
          <span className="meta-label">Created</span>
          <span>{new Date(user.createdAt).toLocaleString()}</span>
        </div>
        <div>
          <span className="meta-label">Last online</span>
          <span>{formatLastSeen(user)}</span>
        </div>
      </div>

      <div className="user-actions">
        <button className="btn btn-primary btn-sm" type="button" onClick={() => onShowQr(user)} disabled={busy}>
          Show QR
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => onDownload(user)} disabled={busy}>
          Download .conf
        </button>
        <button className="btn btn-amber btn-sm" type="button" onClick={() => onRegenerate(user)} disabled={busy}>
          Regenerate keys
        </button>
        <button className="btn btn-danger btn-sm" type="button" onClick={() => onDelete(user)} disabled={busy}>
          Delete
        </button>
      </div>
    </div>
  );
}
