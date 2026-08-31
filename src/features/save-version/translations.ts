export interface SaveVersionTranslations {
  saveVersionDialogTitle: string;
  saveVersionDialogTitleFirst: string;
  saveVersionLoadingTitle: string;
  saveVersionTitleLabel: string;
  saveVersionTitlePlaceholder: string;
  saveVersionTitleGuidance: string;
  saveVersionDescriptionLabel: string;
  saveVersionDescriptionPlaceholder: string;
  saveVersionFilesSummary: (total: number) => string;
  saveVersionRemainingNote: (remaining: number) => string;
  saveVersionPreparedNote: string;
  saveVersionFirstVersionNote: string;
  saveVersionLocalOnlyNote: string;
  saveVersionConfirm: string;
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
  saveVersionTitlePlaceholder: "Summarize what changed…",
  saveVersionTitleGuidance: "Around 50 characters is easy to scan, but longer names are allowed.",
  saveVersionDescriptionLabel: "More details (optional)",
  saveVersionDescriptionPlaceholder: "Add more context, if useful…",
  saveVersionFilesSummary: (total) => (total === 1 ? "1 file will be saved." : `${total} files will be saved.`),
  saveVersionRemainingNote: (remaining) =>
    remaining === 1 ? "1 other file will remain as a pending change." : `${remaining} other files will remain as pending changes.`,
  saveVersionPreparedNote:
    "Some selected changes were prepared earlier with another Git tool. They will be saved together with this selection.",
  saveVersionFirstVersionNote: "This will be this project's first saved version.",
  saveVersionLocalOnlyNote: "This creates a saved version on this computer only. Nothing is sent anywhere yet.",
  saveVersionConfirm: "Save version",
  saveVersionSaving: "Saving your version…",
  saveVersionRetry: "Try again",
  saveVersionSkipHooks: "Save without running the hooks",
  saveVersionSkipHooksNote:
    "Just this once. Your Git hooks setting does not change, and nothing in the project is changed.",
  saveVersionShowDetail: "Show technical details",
  saveVersionHideDetail: "Hide technical details",
  saveVersionDetailHeading: "Technical details",
  saveVersionSuccessTitle: "Version saved",
  saveVersionSuccessDescription: (title, shortCommit) => `Saved "${title}" as ${shortCommit}.`,
  saveVersionSuccessLocalNote: "Saved on this computer. Not published to a remote project yet.",
  saveVersionPublishNow: "Publish now",
  saveVersionDone: "Done",
};

const es: SaveVersionTranslations = {
  saveVersionDialogTitle: "Guardar versión",
  saveVersionDialogTitleFirst: "Guarda tu primera versión",
  saveVersionLoadingTitle: "Preparando una vista previa…",
  saveVersionTitleLabel: "Nombre de la versión",
  saveVersionTitlePlaceholder: "Resume qué cambió…",
  saveVersionTitleGuidance: "Unas 50 letras se leen de un vistazo, pero se permiten nombres más largos.",
  saveVersionDescriptionLabel: "Más detalles (opcional)",
  saveVersionDescriptionPlaceholder: "Añade más contexto, si es útil…",
  saveVersionFilesSummary: (total) =>
    total === 1 ? "Se guardará 1 archivo." : `Se guardarán ${total} archivos.`,
  saveVersionRemainingNote: (remaining) =>
    remaining === 1
      ? "Otro archivo seguirá como cambio pendiente."
      : `Otros ${remaining} archivos seguirán como cambios pendientes.`,
  saveVersionPreparedNote:
    "Algunos cambios seleccionados se habían preparado antes con otra herramienta Git. Se guardarán junto con esta selección.",
  saveVersionFirstVersionNote: "Esta será la primera versión guardada de este proyecto.",
  saveVersionLocalOnlyNote: "Esto crea una versión guardada solo en este equipo. Todavía no se envía nada a ningún sitio.",
  saveVersionConfirm: "Guardar versión",
  saveVersionSaving: "Guardando tu versión…",
  saveVersionRetry: "Reintentar",
  saveVersionSkipHooks: "Guardar sin ejecutar los hooks",
  saveVersionSkipHooksNote:
    "Solo esta vez. Tu ajuste de hooks de Git no cambia, y no se modifica nada del proyecto.",
  saveVersionShowDetail: "Mostrar detalles técnicos",
  saveVersionHideDetail: "Ocultar detalles técnicos",
  saveVersionDetailHeading: "Detalles técnicos",
  saveVersionSuccessTitle: "Versión guardada",
  saveVersionSuccessDescription: (title, shortCommit) => `Guardada "${title}" como ${shortCommit}.`,
  saveVersionSuccessLocalNote: "Guardada en este equipo. Todavía no se ha publicado en un proyecto remoto.",
  saveVersionPublishNow: "Publicar ahora",
  saveVersionDone: "Listo",
};

export const saveVersionTranslations = { en, es } as const;
