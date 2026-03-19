import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext({
  showToast: () => {},
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  const value = useMemo(() => ({ showToast, toasts, removeToast }), [showToast, toasts, removeToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext);
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <button
          type="button"
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => removeToast(toast.id)}
        >
          <span className="toast-type">{toast.type}</span>
          <span>{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
