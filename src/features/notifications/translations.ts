export interface NotificationsTranslations {
  notificationsTitle: string;
  /** The bell's accessible name. It carries the count because that is the only
   * thing about the control that changes, and a screen reader user has no badge
   * to look at. */
  notificationsTrigger: (unread: number) => string;
  notificationsPanelAriaLabel: string;
  notificationsListAriaLabel: string;
  notificationsClear: string;
  notificationsEmptyTitle: string;
  notificationsEmptyLine: string;
  notificationsDisabledTitle: string;
  notificationsDisabledLine: string;
  notificationsDismiss: string;
  notificationsOpenSettings: string;
  notificationsUnreadLabel: string;
  notificationsJustNow: string;
  notificationTeamChangesTitle: (count: number) => string;
  notificationTeamChangesDescription: string;
  notificationTeamChangesAction: string;
  notificationRemoteCheckFailedTitle: string;
  notificationRemoteCheckFailedDescription: string;
  notificationChangesPublishedTitle: (count: number) => string;
  notificationChangesPublishedTo: (destination: string) => string;
  notificationAppUpdateTitle: (version: string) => string;
  notificationAppUpdateDescription: string;
  notificationAppUpdateAction: string;
}

const en: NotificationsTranslations = {
  notificationsTitle: "Notifications",
  notificationsTrigger: (unread) =>
    unread === 0
      ? "Notifications"
      : unread === 1
        ? "Notifications, 1 unread"
        : `Notifications, ${unread} unread`,
  notificationsPanelAriaLabel: "Notifications",
  notificationsListAriaLabel: "Recent notifications",
  notificationsClear: "Clear all",
  notificationsEmptyTitle: "All caught up",
  notificationsEmptyLine: "New notifications show up here.",
  notificationsDisabledTitle: "Notifications are off",
  notificationsDisabledLine: "Turn them on in Settings.",
  notificationsDismiss: "Delete notification",
  notificationsOpenSettings: "Open notification settings",
  notificationsUnreadLabel: "Unread",
  notificationsJustNow: "just now",
  notificationTeamChangesTitle: (count) =>
    `${count} newer ${count === 1 ? "version is" : "versions are"} available`,
  notificationTeamChangesDescription: "Found by an automatic check. Nothing on your computer has changed yet.",
  notificationTeamChangesAction: "Review and get",
  notificationRemoteCheckFailedTitle: "Couldn't check for project changes",
  notificationRemoteCheckFailedDescription: "The last automatic check couldn't reach the remote.",
  notificationChangesPublishedTitle: (count) =>
    count === 1 ? "Published 1 saved version" : `Published ${count} saved versions`,
  notificationChangesPublishedTo: (destination) => `Sent to ${destination}.`,
  notificationAppUpdateTitle: (version) => `v${version} is available`,
  notificationAppUpdateDescription: "Found at startup. Nothing has been downloaded.",
  notificationAppUpdateAction: "View update",
};

const es: NotificationsTranslations = {
  notificationsTitle: "Notificaciones",
  notificationsTrigger: (unread) =>
    unread === 0
      ? "Notificaciones"
      : unread === 1
        ? "Notificaciones, 1 sin leer"
        : `Notificaciones, ${unread} sin leer`,
  notificationsPanelAriaLabel: "Notificaciones",
  notificationsListAriaLabel: "Notificaciones recientes",
  notificationsClear: "Borrar todo",
  notificationsEmptyTitle: "Todo al día",
  notificationsEmptyLine: "Aquí verás las notificaciones nuevas.",
  notificationsDisabledTitle: "Notificaciones desactivadas",
  notificationsDisabledLine: "Actívalas en Ajustes.",
  notificationsDismiss: "Eliminar notificación",
  notificationsOpenSettings: "Abrir ajustes de notificaciones",
  notificationsUnreadLabel: "Sin leer",
  notificationsJustNow: "ahora mismo",
  notificationTeamChangesTitle: (count) =>
    `Hay ${count} ${count === 1 ? "versión nueva" : "versiones nuevas"}`,
  notificationTeamChangesDescription: "Encontrada en una comprobación automática. Aún no ha cambiado nada en tu ordenador.",
  notificationTeamChangesAction: "Revisar y traer",
  notificationRemoteCheckFailedTitle: "No se pudo comprobar si hay cambios",
  notificationRemoteCheckFailedDescription: "La última comprobación automática no pudo llegar al remoto.",
  notificationChangesPublishedTitle: (count) =>
    count === 1 ? "Se publicó 1 versión guardada" : `Se publicaron ${count} versiones guardadas`,
  notificationChangesPublishedTo: (destination) => `Enviado a ${destination}.`,
  notificationAppUpdateTitle: (version) => `Nueva versión disponible: v${version}`,
  notificationAppUpdateDescription: "Detectada al iniciar. No se ha descargado nada.",
  notificationAppUpdateAction: "Ver actualización",
};

export const notificationsTranslations = { en, es } as const;
