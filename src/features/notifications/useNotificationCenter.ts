import { useCallback, useMemo, useRef, useState } from "react";
import {
  markNotificationsRead,
  recordNotification,
  unreadNotificationCount,
  type AppNotification,
  type NotificationDetails,
} from "./domain";

export type NotificationCenterStore = {
  notifications: readonly AppNotification[];
  unreadCount: number;
  /** Records an event. Does nothing while notifications are turned off, so
   * every call site is one unconditional line rather than a repeated `if`. */
  notify: (event: {
    details: NotificationDetails;
    projectId?: string | null;
    projectName?: string | null;
  }) => void;
  markAllRead: () => void;
  /** Removes one entry. Session-scoped and low-stakes, so there is no undo;
   * the alternative the panel offers is "clear all", which is why this is a
   * per-row action the pointer has to reach for rather than a prominent one. */
  dismiss: (id: string) => void;
  clear: () => void;
};

/**
 * Session-scoped store for the notification centre, owned by the composition
 * root.
 *
 * Nothing here reaches Rust, watches a repository, or starts a timer. The
 * centre only ever *records* outcomes that work elsewhere in the app already
 * produced, which is what keeps it free of the "never fetch because a surface
 * appeared" rule the screens live under.
 *
 * `isEnabled` gates recording rather than display: turning notifications off
 * has to mean the app stops collecting, not that it collects silently and hides
 * the pile. What was already recorded stays readable — deleting someone's list
 * because they turned off future ones would be a surprise, not a setting.
 */
export function useNotificationCenter(isEnabled: boolean): NotificationCenterStore {
  const [notifications, setNotifications] = useState<readonly AppNotification[]>([]);
  // A counter, not `crypto.randomUUID()`: these ids never leave the session and
  // only have to be distinct within it, and a counter is one line that works
  // identically in the app and under jsdom.
  const nextIdRef = useRef(0);
  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;

  const notify = useCallback<NotificationCenterStore["notify"]>((event) => {
    if (!isEnabledRef.current) return;
    nextIdRef.current += 1;
    const id = `notification-${nextIdRef.current}`;
    const createdAt = Date.now();
    setNotifications((current) =>
      recordNotification(current, {
        id,
        createdAt,
        details: event.details,
        projectId: event.projectId ?? null,
        projectName: event.projectName ?? null,
      }),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((current) => markNotificationsRead(current));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  const unreadCount = useMemo(() => unreadNotificationCount(notifications), [notifications]);

  return useMemo(
    () => ({ notifications, unreadCount, notify, markAllRead, dismiss, clear }),
    [clear, dismiss, markAllRead, notifications, notify, unreadCount],
  );
}
