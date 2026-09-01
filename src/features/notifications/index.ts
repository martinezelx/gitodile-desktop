/** Public entry point for the notification centre.
 *
 * The feature owns a store and a panel and nothing else: no port, no adapter,
 * no Rust. It records outcomes other work already produced, so there is no
 * transport for it to own. */
export {
  NOTIFICATION_KINDS,
  NOTIFICATION_LIMIT,
  markNotificationsRead,
  notificationAction,
  notificationDetailsEqual,
  recordNotification,
  unreadNotificationCount,
  type AppNotification,
  type NotificationActionId,
  type NotificationDetails,
  type NotificationKind,
  type NotificationRequest,
  type NotificationTone,
} from "./domain";
/* Exported for Settings, which shows the same three glyphs beside its
   explanation of what gets reported. One table, so that claim stays true. */
export { NOTIFICATION_ICONS, type NotificationIcon } from "./icons";
export { useNotificationCenter, type NotificationCenterStore } from "./useNotificationCenter";
export { NotificationCenter, type NotificationCenterProps } from "./NotificationCenter";
