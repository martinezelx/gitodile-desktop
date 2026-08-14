export interface SyncTranslations {
  syncTitle: string;
  syncNotCheckedTitle: string;
  syncNotCheckedMessage: string;
  syncCheckingTitle: string;
  syncCheckingMessage: string;
  syncUpToDateTitle: string;
  syncUpToDateMessage: string;
  syncAheadTitle: (count: number) => string;
  syncAheadMessage: string;
  syncBehindTitle: (count: number) => string;
  syncBehindMessage: string;
  syncDivergedTitle: string;
  syncDivergedMessage: string;
  syncNoRemoteTitle: string;
  syncNoRemoteMessage: string;
  syncNoUpstreamTitle: string;
  syncNoUpstreamMessage: string;
  syncDetachedTitle: string;
  syncDetachedMessage: string;
  syncUnbornTitle: string;
  syncUnbornMessage: string;
  syncUnknownTitle: string;
  syncUnknownMessage: string;
  syncUnavailableTitle: string;
  syncCachedNote: string;
  syncStaleNote: string;
  syncLastChecked: (value: string) => string;
  syncCheck: string;
  syncChecking: string;
  syncCheckAgain: string;
  syncPublish: string;
  syncReviewAndGet: string;
  syncComingSoon: string;
  syncTechnicalDetails: string;
  syncRemote: string;
  syncDestination: string;
  syncTrackingRef: string;
  syncLocalCommit: string;
  syncRemoteCommit: string;
  syncAheadCount: string;
  syncBehindCount: string;
  syncNotAvailable: string;
}

const en: SyncTranslations = {
  syncTitle: "Team changes",
  syncNotCheckedTitle: "Not checked yet",
  syncNotCheckedMessage: "Check when you want the latest team status.",
  syncCheckingTitle: "Checking for team changes…",
  syncCheckingMessage: "Only remote information is updated; your version line and files stay unchanged.",
  syncUpToDateTitle: "You’re up to date",
  syncUpToDateMessage: "Nothing to publish or get.",
  syncAheadTitle: (count) => `${count} saved ${count === 1 ? "version is" : "versions are"} ready to publish`,
  syncAheadMessage: "They’re still only on this computer.",
  syncBehindTitle: (count) => `${count} newer team ${count === 1 ? "version is" : "versions are"} available`,
  syncBehindMessage: "Review and get is coming soon.",
  syncDivergedTitle: "Both sides have changed",
  syncDivergedMessage: "Local and team versions contain different work. Nothing will be combined automatically.",
  syncNoRemoteTitle: "Remote setup required",
  syncNoRemoteMessage: "Add a remote before checking for team changes.",
  syncNoUpstreamTitle: "Choose a publish destination first",
  syncNoUpstreamMessage: "Publish this version line to connect it to a team destination.",
  syncDetachedTitle: "Switch to a version line to check",
  syncDetachedMessage: "A specific saved version has no team destination.",
  syncUnbornTitle: "Save a version before checking",
  syncUnbornMessage: "There is no saved version to compare yet.",
  syncUnknownTitle: "Team result unavailable",
  syncUnknownMessage: "The configured team version could not be compared.",
  syncUnavailableTitle: "Couldn’t check team changes",
  syncCachedNote: "Not checked this session · using saved remote information.",
  syncStaleNote: "This result may be out of date.",
  syncLastChecked: (value) => `Checked ${value}.`,
  syncCheck: "Check for team changes",
  syncChecking: "Checking…",
  syncCheckAgain: "Check again",
  syncPublish: "Publish changes",
  syncReviewAndGet: "Review and get",
  syncComingSoon: "Coming soon",
  syncTechnicalDetails: "Technical details",
  syncRemote: "Remote",
  syncDestination: "Destination branch",
  syncTrackingRef: "Tracking reference",
  syncLocalCommit: "Local commit",
  syncRemoteCommit: "Remote commit",
  syncAheadCount: "Saved locally",
  syncBehindCount: "Newer on team",
  syncNotAvailable: "Not available",
};

const es: SyncTranslations = {
  syncTitle: "Cambios del equipo",
  syncNotCheckedTitle: "Aún no se ha comprobado",
  syncNotCheckedMessage: "Comprueba cuando quieras conocer el estado más reciente del equipo.",
  syncCheckingTitle: "Comprobando cambios del equipo…",
  syncCheckingMessage: "Solo se actualiza la información remota; tu línea de versión y tus archivos no cambian.",
  syncUpToDateTitle: "Todo está al día",
  syncUpToDateMessage: "No hay nada que publicar ni obtener.",
  syncAheadTitle: (count) => `${count} ${count === 1 ? "versión guardada está" : "versiones guardadas están"} lista${count === 1 ? "" : "s"} para publicar`,
  syncAheadMessage: "Todavía solo están en este equipo.",
  syncBehindTitle: (count) => `Hay ${count} ${count === 1 ? "versión nueva" : "versiones nuevas"} del equipo`,
  syncBehindMessage: "Revisar y obtener estará disponible próximamente.",
  syncDivergedTitle: "Ambos lados han cambiado",
  syncDivergedMessage: "Las versiones locales y del equipo contienen trabajo diferente. Nada se combinará automáticamente.",
  syncNoRemoteTitle: "Falta configurar el remoto",
  syncNoRemoteMessage: "Añade un remoto antes de comprobar cambios del equipo.",
  syncNoUpstreamTitle: "Elige primero un destino de publicación",
  syncNoUpstreamMessage: "Publica esta línea de versión para conectarla a un destino del equipo.",
  syncDetachedTitle: "Cambia a una línea de versión para comprobar",
  syncDetachedMessage: "Una versión guardada concreta no tiene destino de equipo.",
  syncUnbornTitle: "Guarda una versión antes de comprobar",
  syncUnbornMessage: "Todavía no hay una versión guardada que comparar.",
  syncUnknownTitle: "Resultado del equipo no disponible",
  syncUnknownMessage: "No se ha podido comparar la versión configurada del equipo.",
  syncUnavailableTitle: "No se pudieron comprobar los cambios del equipo",
  syncCachedNote: "No comprobado en esta sesión · usando información remota guardada.",
  syncStaleNote: "Este resultado puede estar desactualizado.",
  syncLastChecked: (value) => `Comprobado: ${value}.`,
  syncCheck: "Comprobar cambios del equipo",
  syncChecking: "Comprobando…",
  syncCheckAgain: "Comprobar de nuevo",
  syncPublish: "Publicar cambios",
  syncReviewAndGet: "Revisar y obtener",
  syncComingSoon: "Próximamente",
  syncTechnicalDetails: "Detalles técnicos",
  syncRemote: "Remoto",
  syncDestination: "Rama de destino",
  syncTrackingRef: "Referencia de seguimiento",
  syncLocalCommit: "Commit local",
  syncRemoteCommit: "Commit remoto",
  syncAheadCount: "Guardadas localmente",
  syncBehindCount: "Nuevas en el equipo",
  syncNotAvailable: "No disponible",
};

export const syncTranslations = { en, es } as const;
