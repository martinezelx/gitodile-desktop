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
  notificationsEmptyDescription: string;
  notificationsDisabledTitle: string;
  notificationsDisabledDescription: string;
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
  notificationsEmptyTitle: "Nothing to report",
  notificationsEmptyDescription:
    "GitOdile tells you here when newer project versions turn up, or when an automatic check cannot reach the remote project.",
  notificationsDisabledTitle: "Notifications are turned off",
  notificationsDisabledDescription:
    "GitOdile is not recording anything new. Turn notifications back on to hear about project changes and failed checks.",
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
  notificationsEmptyTitle: "Nada que contar",
  notificationsEmptyDescription:
    "GitOdile te avisa aquí cuando aparecen versiones nuevas del proyecto o cuando una comprobación automática no puede conectar con el proyecto remoto.",
  notificationsDisabledTitle: "Las notificaciones están desactivadas",
  notificationsDisabledDescription:
    "GitOdile no está registrando nada nuevo. Vuelve a activarlas para enterarte de los cambios del proyecto y de las comprobaciones fallidas.",
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
};

export const notificationsTranslations = { en, es } as const;
