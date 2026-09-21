export interface WorkbenchTranslations {
  workbenchTabsAriaLabel: string;
  workbenchTabChanges: string;
  workbenchTabHistory: string;
}

const en: WorkbenchTranslations = {
  workbenchTabsAriaLabel: "Changes or history",
  workbenchTabChanges: "Changes",
  workbenchTabHistory: "History",
};

const es: WorkbenchTranslations = {
  workbenchTabsAriaLabel: "Cambios o historial",
  workbenchTabChanges: "Cambios",
  workbenchTabHistory: "Historial",
};

export const workbenchTranslations = { en, es } as const;
