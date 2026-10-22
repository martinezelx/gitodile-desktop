import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

export type ToastRequest = {
  message: string;
  icon?: React.ReactNode;
  action?: { label: string; onAction: () => void };
  /** How long the toast stays before it dismisses itself, in milliseconds.
   * Omit it for the default: five seconds, or no timeout at all when the toast
   * offers an action, so the reader can reach for it. Pass `null` to keep it
   * until it is dismissed. */
  durationMs?: number | null;
};

type ToastEntry = ToastRequest & { id: number };
type ShowToast = (request: ToastRequest) => void;

/** DESIGN.md § Dialogs: a result with no next step is a toast, not a dialog
 * the reader has to dismiss. Without a provider (a component rendered on its
 * own in a test) showing one does nothing. */
const ToastContext = createContext<ShowToast>(() => undefined);

const TOAST_DURATION_MS = 5000;
/** A small stack, so two results that land together are both still readable.
 * The oldest drops off once a fourth arrives. */
const MAX_VISIBLE_TOASTS = 3;

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

/** Five seconds for a plain result; a toast that carries an action waits for
 * the reader instead of vanishing mid-reach (Carbon's actionable
 * notifications). An explicit `durationMs`, including `null`, always wins. */
function resolveDuration(toast: ToastEntry): number | null {
  if (toast.durationMs !== undefined) {
    return toast.durationMs;
  }
  return toast.action ? null : TOAST_DURATION_MS;
}

export function ToastProvider({
  children,
  dismissLabel = "Close",
}: {
  children: React.ReactNode;
  /** Accessible name for each toast's dismiss control. */
  dismissLabel?: string;
}): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);
  const show = useCallback<ShowToast>((request) => {
    nextId.current += 1;
    const entry: ToastEntry = { ...request, id: nextId.current };
    setToasts((current) => [...current, entry].slice(-MAX_VISIBLE_TOASTS));
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismissLabel={dismissLabel} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  dismissLabel,
  onDismiss,
}: {
  toasts: ToastEntry[];
  dismissLabel: string;
  onDismiss: (id: number) => void;
}): React.JSX.Element {
  return (
    // The live region stays mounted so a screen reader hears each new toast.
    // It is not atomic: a message is announced as it arrives, and a second
    // result does not make the reader hear the first one again. Newest is
    // rendered last, so it sits closest to the status bar.
    <div className="app-toast-viewport" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} dismissLabel={dismissLabel} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  dismissLabel,
  onDismiss,
}: {
  toast: ToastEntry;
  dismissLabel: string;
  onDismiss: (id: number) => void;
}): React.JSX.Element {
  const duration = resolveDuration(toast);
  const [paused, setPaused] = useState(false);
  // The clock's remaining time, kept across a pause so resuming continues from
  // where the reader interrupted rather than restarting the whole wait.
  const remainingRef = useRef(duration ?? 0);

  useEffect(() => {
    if (duration === null || paused) {
      return undefined;
    }
    const remaining = remainingRef.current;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remaining - (Date.now() - startedAt));
    };
  }, [duration, paused, toast.id, onDismiss]);

  return (
    <div
      className={duration === null ? "app-toast" : "app-toast app-toast--progress"}
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
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        className="app-toast__close"
        type="button"
        aria-label={dismissLabel}
        onClick={() => onDismiss(toast.id)}
      >
        <X aria-hidden="true" />
      </button>
      {duration !== null && (
        <span className="app-toast__progress" aria-hidden="true">
          <span
            className="app-toast__progress-fill"
            style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? "paused" : "running" }}
          />
        </span>
      )}
    </div>
  );
}
