import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ToastRequest = {
  message: string;
  icon?: React.ReactNode;
  action?: { label: string; onAction: () => void };
};

type ToastEntry = ToastRequest & { id: number };
type ShowToast = (request: ToastRequest) => void;

/** DESIGN.md § Dialogs: a result with no next step is a toast, not a dialog
 * the reader has to dismiss. Without a provider (a component rendered on its
 * own in a test) showing one does nothing. */
const ToastContext = createContext<ShowToast>(() => undefined);

const TOAST_DURATION_MS = 5000;

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toast, setToast] = useState<ToastEntry | null>(null);
  const nextId = useRef(0);
  const show = useCallback<ShowToast>((request) => {
    nextId.current += 1;
    setToast({ ...request, id: nextId.current });
  }, []);
  const dismiss = useCallback(() => setToast(null), []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toast, onDismiss }: { toast: ToastEntry | null; onDismiss: () => void }): React.JSX.Element {
  const [paused, setPaused] = useState(false);
  // A new toast starts its own clock: a pause left over from one that was
  // replaced under the pointer would otherwise keep this one up for good.
  useEffect(() => setPaused(false), [toast?.id]);
  useEffect(() => {
    if (!toast || paused) return undefined;
    const timer = window.setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast, paused, onDismiss]);
  return (
    // The live region stays mounted so a screen reader hears each new toast.
    <div className="app-toast-viewport" role="status" aria-live="polite" aria-atomic="true">
      {toast && (
        <div
          key={toast.id}
          className="app-toast"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {toast.icon && <span className="app-toast__icon" aria-hidden="true">{toast.icon}</span>}
          <span className="app-toast__message">{toast.message}</span>
          {toast.action && (
            <button
              className="app-toast__action"
              type="button"
              onClick={() => {
                toast.action?.onAction();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
