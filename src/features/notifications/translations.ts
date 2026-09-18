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
  notificationsEmptyLine: "News shows up here.",
  notificationsDisabledTitle: "Notifications are off",
  notificationsDisabledLine: "Turn them on to get alerts.",
  notificationsDismiss: "Delete notification",
  notificationsOpenSettings: "Open notification settings",
  notificationsUnreadLabel: "Unread",
  notificationsJustNow: "just now",
  notificationTeamChangesTitle: (count) =>
    `${count} newer project ${count === 1 ? "version is" : "versions are"} available`,
  notificationTeamChangesDescription: "Found by an automatic check. Nothing has changed on your computer yet.",
  notificationTeamChangesAction: "Review and get them",
  notificationRemoteCheckFailedTitle: "Couldn't check for project changes",
  notificationRemoteCheckFailedDescription:
    "The last automatic check could not reach the remote project.",
  notificationChangesPublishedTitle: (count) =>
    count === 1 ? "Published 1 saved version" : `Published ${count} saved versions`,
  notificationChangesPublishedTo: (destination) => `Sent to ${destination}.`,
  notificationAppUpdateTitle: (version) => `v${version} is available`,
  notificationAppUpdateDescription: "Found by the startup check. Nothing has been downloaded.",
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
  notificationsEmptyLine: "Aquí verás las novedades.",
  notificationsDisabledTitle: "Notificaciones desactivadas",
  notificationsDisabledLine: "Actívalas para recibir avisos.",
  notificationsDismiss: "Eliminar notificación",
  notificationsOpenSettings: "Abrir ajustes de notificaciones",
  notificationsUnreadLabel: "Sin leer",
  notificationsJustNow: "ahora mismo",
  notificationTeamChangesTitle: (count) =>
    `Hay ${count} ${count === 1 ? "versión nueva" : "versiones nuevas"} del proyecto`,
  notificationTeamChangesDescription:
    "Lo encontró una comprobación automática. Todavía no ha cambiado nada en tu equipo.",
  notificationTeamChangesAction: "Revisarlas y obtenerlas",
  notificationRemoteCheckFailedTitle: "No se pudo comprobar si hay cambios",
  notificationRemoteCheckFailedDescription:
    "La última comprobación automática no pudo conectar con el proyecto remoto.",
  notificationChangesPublishedTitle: (count) =>
    count === 1 ? "Se publicó 1 versión guardada" : `Se publicaron ${count} versiones guardadas`,
  notificationChangesPublishedTo: (destination) => `Enviado a ${destination}.`,
  notificationAppUpdateTitle: (version) => `Hay una versión nueva: v${version}`,
  notificationAppUpdateDescription: "Lo encontró la comprobación al iniciar. No se ha descargado nada.",
  notificationAppUpdateAction: "Ver actualización",
};

export const notificationsTranslations = { en, es } as const;
