export default function Modal({ title, children, actions, onClose, size = 'default' }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal modal-${size}`} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header-row">
          <h2 className="modal-title">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
