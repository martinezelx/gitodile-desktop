export interface SaveVersionTranslations {
  saveVersionDialogTitle: string;
  saveVersionDialogTitleFirst: string;
  saveVersionLoadingTitle: string;
  saveVersionTitleLabel: string;
  /** The two placeholders are a pair of questions: the name says what
   * changed, the details why — what the name cannot. "What changed", not
   * "what did you change": the change may be an AI's or a teammate's. */
  saveVersionTitlePlaceholder: string;
  saveVersionTitleGuidance: string;
  saveVersionDescriptionLabel: string;
  saveVersionDescriptionPlaceholder: string;
  saveVersionFilesSummary: (total: number) => string;
  saveVersionRemainingNote: (remaining: number) => string;
  saveVersionPreparedNote: string;
  saveVersionFirstVersionNote: string;
  saveVersionFirstVersionOnLineNote: (branch: string) => string;
  saveVersionDestination: (branch: string) => string;
  saveVersionNoDestinationNote: string;
  saveVersionLocalOnlyNote: string;
  saveVersionConfirm: string;
  saveVersionConfirmAndPublish: string;
  saveVersionPublishToggleLabel: string;
  saveVersionPublishToggleHint: string;
  saveVersionSaving: string;
  saveVersionRetry: string;
  saveVersionSkipHooks: string;
  saveVersionSkipHooksNote: string;
  saveVersionShowDetail: string;
  saveVersionHideDetail: string;
  saveVersionDetailHeading: string;
  saveVersionSuccessTitle: string;
  saveVersionSuccessDescription: (title: string, shortCommit: string) => string;
  saveVersionSuccessLocalNote: string;
  saveVersionPublishNow: string;
  saveVersionDone: string;
}

const en: SaveVersionTranslations = {
  saveVersionDialogTitle: "Save version",
  saveVersionDialogTitleFirst: "Save your first version",
  saveVersionLoadingTitle: "Preparing a preview…",
  saveVersionTitleLabel: "Version name",
  saveVersionTitlePlaceholder: "What changed?",
  saveVersionTitleGuidance: "About 50 characters is easy to scan, but longer is fine.",
  saveVersionDescriptionLabel: "More details (optional)",
  saveVersionDescriptionPlaceholder: "Why? (optional)",
  saveVersionFilesSummary: (total) => (total === 1 ? "1 file will be saved." : `${total} files will be saved.`),
  saveVersionRemainingNote: (remaining) =>
    remaining === 1 ? "1 other file stays unsaved." : `${remaining} other files stay unsaved.`,
  saveVersionPreparedNote: "Some changes were prepared earlier with another Git tool, and they'll be saved too.",
  saveVersionFirstVersionNote: "This will be the project's first saved version.",
  saveVersionFirstVersionOnLineNote: (branch) => `This will be the first saved version on ${branch}.`,
  saveVersionDestination: (branch) => `Saves to ${branch}.`,
  saveVersionNoDestinationNote: "You're not on a version line, so this version won't belong to one. Create a line here to keep it easy to find.",
  saveVersionLocalOnlyNote: "Saved on this computer only, and nothing is sent yet.",
  saveVersionConfirm: "Save",
  saveVersionConfirmAndPublish: "Save and publish",
  saveVersionPublishToggleLabel: "Also publish",
  saveVersionPublishToggleHint: "Opens Publish after saving.",
  saveVersionSaving: "Saving your version…",
  saveVersionRetry: "Try again",
  saveVersionSkipHooks: "Save without running hooks",
  saveVersionSkipHooksNote: "Just this once, so your hooks setting and the project stay as they are.",
  saveVersionShowDetail: "Show technical details",
  saveVersionHideDetail: "Hide technical details",
  saveVersionDetailHeading: "Technical details",
  saveVersionSuccessTitle: "Version saved",
  saveVersionSuccessDescription: (title, shortCommit) => `Saved “${title}” as ${shortCommit}.`,
  saveVersionSuccessLocalNote: "Saved on this computer, but not published yet.",
  saveVersionPublishNow: "Publish now",
  saveVersionDone: "Done",
};

const es: SaveVersionTranslations = {
  saveVersionDialogTitle: "Guardar versión",
  saveVersionDialogTitleFirst: "Guarda tu primera versión",
  saveVersionLoadingTitle: "Preparando una vista previa…",
  saveVersionTitleLabel: "Nombre de la versión",
  saveVersionTitlePlaceholder: "¿Qué cambió?",
  saveVersionTitleGuidance: "Unos 50 caracteres se leen de un vistazo, pero puede ser más largo.",
  saveVersionDescriptionLabel: "Más detalles (opcional)",
  saveVersionDescriptionPlaceholder: "¿Por qué? (opcional)",
  saveVersionFilesSummary: (total) =>
    total === 1 ? "Se guardará 1 archivo." : `Se guardarán ${total} archivos.`,
  saveVersionRemainingNote: (remaining) =>
    remaining === 1
      ? "Otro archivo se queda sin guardar."
      : `Otros ${remaining} archivos se quedan sin guardar.`,
  saveVersionPreparedNote: "Algunos cambios se prepararon antes con otra herramienta de Git y también se guardarán.",
  saveVersionFirstVersionNote: "Será la primera versión guardada del proyecto.",
  saveVersionFirstVersionOnLineNote: (branch) => `Será la primera versión guardada en ${branch}.`,
  saveVersionDestination: (branch) => `Se guarda en ${branch}.`,
  saveVersionNoDestinationNote: "No estás en una línea de versión, así que esta versión no pertenecerá a ninguna. Crea aquí una línea para que sea fácil de encontrar.",
  saveVersionLocalOnlyNote: "Se guarda solo en este ordenador y todavía no se envía nada.",
  saveVersionConfirm: "Guardar",
  saveVersionConfirmAndPublish: "Guardar y publicar",
  saveVersionPublishToggleLabel: "Publicar también",
  saveVersionPublishToggleHint: "Abre Publicar después de guardar.",
  saveVersionSaving: "Guardando tu versión…",
  saveVersionRetry: "Reintentar",
  saveVersionSkipHooks: "Guardar sin ejecutar los hooks",
  saveVersionSkipHooksNote: "Solo esta vez, así que tu ajuste de hooks y el proyecto se quedan como están.",
  saveVersionShowDetail: "Mostrar detalles técnicos",
  saveVersionHideDetail: "Ocultar detalles técnicos",
  saveVersionDetailHeading: "Detalles técnicos",
  saveVersionSuccessTitle: "Versión guardada",
  saveVersionSuccessDescription: (title, shortCommit) => `«${title}» guardada como ${shortCommit}.`,
  saveVersionSuccessLocalNote: "Guardada en este ordenador, pero aún sin publicar.",
  saveVersionPublishNow: "Publicar ahora",
  saveVersionDone: "Listo",
};

export const saveVersionTranslations = { en, es } as const;
