import type { ChangeCategory } from "../status";

export interface SaveVersionTranslations {
  saveVersionDialogTitle: string;
  saveVersionDialogTitleFirst: string;
  saveVersionLoadingTitle: string;
  saveVersionChecking: string;
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
  /** The dialog's summary headline; the line they land on is a chip beside it. */
  saveVersionFilesCount: (total: number) => string;
  saveVersionShowFiles: string;
  saveVersionHideFiles: string;
  saveVersionFilesListLabel: string;
  /** One file's tag in the list: the breakdown's words, for one file. */
  saveVersionFileKind: Record<ChangeCategory, string>;
  /** Under a list the plan cut short; Changes lists every file. */
  saveVersionMoreFiles: (count: number) => string;
  saveVersionAddDetails: string;
  /** The primary's tooltip; `mod` is the platform's keycap (Ctrl or ⌘). */
  saveVersionShortcutHint: (mod: string) => string;
  saveVersionNoDestinationNote: string;
  saveVersionLocalOnlyNote: string;
  saveVersionPublishNextNote: string;
  saveVersionConfirm: string;
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
  saveVersionChecking: "Checking…",
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
  saveVersionFilesCount: (total) => (total === 1 ? "1 file" : `${total} files`),
  saveVersionShowFiles: "Show files",
  saveVersionHideFiles: "Hide files",
  saveVersionFilesListLabel: "Files in this version",
  saveVersionFileKind: { changed: "edited", new: "new", deleted: "deleted", renamed: "renamed", conflicted: "needs attention" },
  saveVersionMoreFiles: (count) => (count === 1 ? "And 1 more — Changes lists every file." : `And ${count} more — Changes lists every file.`),
  saveVersionAddDetails: "Add details",
  saveVersionShortcutHint: (mod) => `${mod}+Enter`,
  saveVersionNoDestinationNote: "You're not on a version line. Create one so this version is easy to find.",
  saveVersionLocalOnlyNote: "Only on this computer until you publish.",
  saveVersionPublishNextNote: "You'll review it before anything is published.",
  saveVersionConfirm: "Save",
  saveVersionConfirmAndPublish: "Save and publish",
  saveVersionPublishToggleLabel: "Also publish",
  saveVersionPublishAfterLabel: "Publish after saving",
  saveVersionSaving: "Saving…",
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
  saveVersionChecking: "Comprobando…",
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
  saveVersionFilesCount: (total) => (total === 1 ? "1 archivo" : `${total} archivos`),
  saveVersionShowFiles: "Ver archivos",
  saveVersionHideFiles: "Ocultar archivos",
  saveVersionFilesListLabel: "Archivos de esta versión",
  saveVersionFileKind: { changed: "editado", new: "nuevo", deleted: "eliminado", renamed: "renombrado", conflicted: "necesita atención" },
  saveVersionMoreFiles: (count) => (count === 1 ? "Y 1 más: Cambios los muestra todos." : `Y ${count} más: Cambios los muestra todos.`),
  saveVersionAddDetails: "Añadir detalles",
  saveVersionShortcutHint: (mod) => `${mod}+Intro`,
  saveVersionNoDestinationNote: "No estás en ninguna línea de versión. Crea una para no perder de vista esta versión.",
  saveVersionLocalOnlyNote: "Solo en este ordenador hasta que publiques.",
  saveVersionPublishNextNote: "Lo revisarás antes de que se publique nada.",
  saveVersionConfirm: "Guardar",
  saveVersionConfirmAndPublish: "Guardar y publicar",
  saveVersionPublishToggleLabel: "Publicar también",
  saveVersionPublishAfterLabel: "Publicar después de guardar",
  saveVersionSaving: "Guardando…",
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
