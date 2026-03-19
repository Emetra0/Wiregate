function truncateKey(value) {
  if (!value) return 'Unavailable';
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

export default function UserCard({ user, onDownload, onRegenerate, onDelete }) {
  return (
    <div className="card user-card">
      <div className="user-card-top">
        <div>
          <h3>{user.name}</h3>
          <p className="muted-text">{user.email || 'No email provided'}</p>
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
      </div>

      <div className="user-actions">
        <button className="btn btn-primary btn-sm" type="button" onClick={() => onDownload(user)}>
          Download config
        </button>
        <button className="btn btn-amber btn-sm" type="button" onClick={() => onRegenerate(user)}>
          Regenerate keys
        </button>
        <button className="btn btn-danger btn-sm" type="button" onClick={() => onDelete(user)}>
          Delete
        </button>
      </div>
    </div>
  );
}
