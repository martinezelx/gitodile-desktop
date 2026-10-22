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
  notificationUpstreamGoneTitle: (branch: string | null, remote: string | null) => string;
  notificationUpstreamGoneDescription: string;
  notificationUpstreamGoneAction: string;
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
  notificationTeamChangesDescription: "Found by an automatic check, and nothing on your computer has changed yet.",
  notificationTeamChangesAction: "Review and get",
  notificationRemoteCheckFailedTitle: "Couldn't check for project changes",
  notificationRemoteCheckFailedDescription: "The last automatic check couldn't reach the remote.",
  notificationChangesPublishedTitle: (count) =>
    count === 0
      ? "Published the branch"
      : count === 1 ? "Published 1 saved version" : `Published ${count} saved versions`,
  notificationChangesPublishedTo: (destination) => `Sent to ${destination}.`,
  notificationAppUpdateTitle: (version) => `New version available: ${version}`,
  notificationAppUpdateDescription: "Found at startup, and nothing has been downloaded.",
  notificationAppUpdateAction: "View update",
  notificationUpstreamGoneTitle: (branch, remote) =>
    `${branch ? `“${branch}”` : "This branch"} is no longer on ${remote ? `“${remote}”` : "the remote"}`,
  notificationUpstreamGoneDescription: "It was deleted on the remote. Your work on this computer hasn't changed.",
  notificationUpstreamGoneAction: "See options",
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
  notificationTeamChangesDescription: "Encontrada en una comprobación automática, sin que haya cambiado aún nada en tu ordenador.",
  notificationTeamChangesAction: "Revisar y traer",
  notificationRemoteCheckFailedTitle: "No se pudo comprobar si hay cambios",
  notificationRemoteCheckFailedDescription: "La última comprobación automática no pudo llegar al remoto.",
  notificationChangesPublishedTitle: (count) =>
    count === 0
      ? "Se publicó la rama"
      : count === 1 ? "Se publicó 1 versión guardada" : `Se publicaron ${count} versiones guardadas`,
  notificationChangesPublishedTo: (destination) => `Enviado a ${destination}.`,
  notificationAppUpdateTitle: (version) => `Nueva versión disponible: ${version}`,
  notificationAppUpdateDescription: "Detectada al iniciar, sin descargar nada.",
  notificationAppUpdateAction: "Ver actualización",
  notificationUpstreamGoneTitle: (branch, remote) =>
    `${branch ? `«${branch}»` : "Esta rama"} ya no está en ${remote ? `«${remote}»` : "el remoto"}`,
  notificationUpstreamGoneDescription: "Se borró en el remoto. Tu trabajo en este ordenador no ha cambiado.",
  notificationUpstreamGoneAction: "Ver opciones",
};

export const notificationsTranslations = { en, es } as const;
