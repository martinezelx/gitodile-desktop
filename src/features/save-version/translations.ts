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
  saveVersionRemainingNote: (remaining: number) => string;
  saveVersionPreparedNote: string;
  saveVersionFirstVersionNote: string;
  saveVersionFirstVersionOnLineNote: (branch: string) => string;
  /** The dialog's one summary line: how many files and where they land. */
  saveVersionSummary: (total: number, branch: string | null) => string;
  saveVersionNoDestinationNote: string;
  saveVersionLocalOnlyNote: string;
  saveVersionConfirm: string;
  /** The dialog repeats its title's verb; the quick box keeps the short one. */
  saveVersionDialogConfirm: string;
  saveVersionConfirmAndPublish: string;
  saveVersionPublishToggleLabel: string;
  saveVersionPublishAfterLabel: string;
  saveVersionSaving: string;
  saveVersionRetry: string;
  saveVersionSkipHooks: string;
  saveVersionShowDetail: string;
  saveVersionHideDetail: string;
  saveVersionDetailHeading: string;
  saveVersionSuccessTitle: string;
  saveVersionSuccessDescription: (title: string, shortCommit: string) => string;
  saveVersionSavedOn: (title: string, branch: string | null) => string;
  saveVersionPublishNow: string;
  saveVersionDone: string;
}

const en: SaveVersionTranslations = {
  saveVersionDialogTitle: "Save version",
  saveVersionDialogTitleFirst: "Save your first version",
  saveVersionLoadingTitle: "Preparing a preview…",
  saveVersionTitleLabel: "Version name",
  saveVersionTitlePlaceholder: "What changed?",
  saveVersionTitleGuidance: "Short names read better in History.",
  saveVersionDescriptionLabel: "More details (optional)",
  saveVersionDescriptionPlaceholder: "Why?",
  saveVersionRemainingNote: (remaining) =>
    remaining === 1 ? "1 other file stays unsaved." : `${remaining} other files stay unsaved.`,
  saveVersionPreparedNote: "Some changes were prepared earlier with another Git tool, and they'll be saved too.",
  saveVersionFirstVersionNote: "This will be the project's first saved version.",
  saveVersionFirstVersionOnLineNote: (branch) => `This will be the first saved version on ${branch}.`,
  saveVersionSummary: (total, branch) => {
    const files = total === 1 ? "1 file" : `${total} files`;
    return branch ? `${files} on “${branch}”` : files;
  },
  saveVersionNoDestinationNote: "You're not on a version line. Create one so this version is easy to find.",
  saveVersionLocalOnlyNote: "Only on this computer until you publish.",
  saveVersionConfirm: "Save",
  saveVersionDialogConfirm: "Save version",
  saveVersionConfirmAndPublish: "Save and publish",
  saveVersionPublishToggleLabel: "Also publish",
  saveVersionPublishAfterLabel: "Publish after saving",
  saveVersionSaving: "Saving your version…",
  saveVersionRetry: "Try again",
  saveVersionSkipHooks: "Save without running hooks",
  saveVersionShowDetail: "Show technical details",
  saveVersionHideDetail: "Hide technical details",
  saveVersionDetailHeading: "Technical details",
  saveVersionSuccessTitle: "Version saved",
  saveVersionSuccessDescription: (title, shortCommit) => `Saved “${title}” as ${shortCommit}.`,
  saveVersionSavedOn: (title, branch) =>
    branch ? `“${title}” is on “${branch}”, only on this computer.` : `“${title}” is saved, only on this computer.`,
  saveVersionPublishNow: "Publish now",
  saveVersionDone: "Done",
};

const es: SaveVersionTranslations = {
  saveVersionDialogTitle: "Guardar versión",
  saveVersionDialogTitleFirst: "Guarda tu primera versión",
  saveVersionLoadingTitle: "Preparando una vista previa…",
  saveVersionTitleLabel: "Nombre de la versión",
  saveVersionTitlePlaceholder: "¿Qué cambió?",
  saveVersionTitleGuidance: "Los nombres cortos se leen mejor en el historial.",
  saveVersionDescriptionLabel: "Más detalles (opcional)",
  saveVersionDescriptionPlaceholder: "¿Por qué?",
  saveVersionRemainingNote: (remaining) =>
    remaining === 1
      ? "Otro archivo se queda sin guardar."
      : `Otros ${remaining} archivos se quedan sin guardar.`,
  saveVersionPreparedNote: "Algunos cambios se prepararon antes con otra herramienta de Git y también se guardarán.",
  saveVersionFirstVersionNote: "Será la primera versión guardada del proyecto.",
  saveVersionFirstVersionOnLineNote: (branch) => `Será la primera versión guardada en ${branch}.`,
  saveVersionSummary: (total, branch) => {
    const files = total === 1 ? "1 archivo" : `${total} archivos`;
    return branch ? `${files} en «${branch}»` : files;
  },
  saveVersionNoDestinationNote: "No estás en ninguna línea de versión. Crea una para no perder de vista esta versión.",
  saveVersionLocalOnlyNote: "Solo en este ordenador hasta que publiques.",
  saveVersionConfirm: "Guardar",
  saveVersionDialogConfirm: "Guardar versión",
  saveVersionConfirmAndPublish: "Guardar y publicar",
  saveVersionPublishToggleLabel: "Publicar también",
  saveVersionPublishAfterLabel: "Publicar después de guardar",
  saveVersionSaving: "Guardando tu versión…",
  saveVersionRetry: "Reintentar",
  saveVersionSkipHooks: "Guardar sin ejecutar los hooks",
  saveVersionShowDetail: "Mostrar detalles técnicos",
  saveVersionHideDetail: "Ocultar detalles técnicos",
  saveVersionDetailHeading: "Detalles técnicos",
  saveVersionSuccessTitle: "Versión guardada",
  saveVersionSuccessDescription: (title, shortCommit) => `«${title}» guardada como ${shortCommit}.`,
  saveVersionSavedOn: (title, branch) =>
    branch ? `«${title}» está en «${branch}», solo en este ordenador.` : `«${title}» está guardada, solo en este ordenador.`,
  saveVersionPublishNow: "Publicar ahora",
  saveVersionDone: "Listo",
};

export const saveVersionTranslations = { en, es } as const;
