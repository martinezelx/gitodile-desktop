import { useEffect, useRef } from "react";
import { readSystemInfo } from "./systemInfo";

/** Whether this window has macOS's own traffic lights and menu bar. Only the
 * Tauri build on macOS does (`tauri.macos.conf.json`); a browser run on a Mac
 * has neither, so the user agent cannot decide it. */
export function hasNativeMacWindowChrome(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && readSystemInfo()?.platform === "macos";
}

/** What a custom entry of the macOS menu bar asks the app to do. Each one is a
 * handler the overflow menu or the titlebar already calls; the menu bar is a
 * second way in, not a second implementation (task 204). */
export type AppMenuCommand =
  | "about"
  | "check-updates"
  | "settings"
  | "home"
  | "open-project"
  | "create-project"
  | "clone-project"
  | "close-project"
  | "toggle-sidebar"
  | "go-back"
  | "go-forward"
  | "reload-window"
  | "keyboard-shortcuts"
  | "whats-new"
  | "report-issue";

/** Items whose behaviour belongs to macOS itself. Their names are the ones
 * `@tauri-apps/api/menu` takes, so the adapter can pass them straight through. */
export type NativeMenuItem =
  | "Services"
  | "Hide"
  | "HideOthers"
  | "ShowAll"
  | "Quit"
  | "CloseWindow"
  | "Undo"
  | "Redo"
  | "Cut"
  | "Copy"
  | "Paste"
  | "SelectAll"
  | "Fullscreen"
  | "Minimize"
  | "Maximize"
  | "BringAllToFront";

export type AppMenuEntry =
  | { kind: "command"; command: AppMenuCommand; text: string; enabled: boolean }
  | { kind: "native"; item: NativeMenuItem; text: string }
  | { kind: "separator" };

export type AppMenuSection = { id: string; text: string; entries: AppMenuEntry[] };

export type AppMenuLabels = {
  about: string;
  checkUpdates: string;
  settings: string;
  home: string;
  openProject: string;
  openingProject: string;
  createProject: string;
  cloneProject: string;
  closeProject: string;
  hideSidebar: string;
  showSidebar: string;
  goBack: string;
  goForward: string;
  reloadWindow: string;
  keyboardShortcuts: string;
  whatsNew: string;
  reportIssue: string;
  file: string;
  edit: string;
  view: string;
  window: string;
  help: string;
  services: string;
  hide: string;
  hideOthers: string;
  showAll: string;
  quit: string;
  closeWindow: string;
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
  fullscreen: string;
  minimize: string;
  zoom: string;
  bringAllToFront: string;
};

/** The facts the overflow menu and the titlebar read to enable their
 * controls. `hasOpenDialog` has no counterpart there: a dialog's backdrop
 * covers the titlebar, but nothing covers the menu bar, so every custom entry
 * is turned off while a dialog owns the screen — the same guard the keyboard
 * shortcuts use. */
export type AppMenuState = {
  hasProject: boolean;
  isOpeningProject: boolean;
  canReloadWindow: boolean;
  isReportingIssue: boolean;
  isSidebarHidden: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  hasOpenDialog: boolean;
};

const SEPARATOR: AppMenuEntry = { kind: "separator" };

/** The macOS menu bar, top to bottom. The first section is the application
 * menu: macOS titles it with the app's name whatever text it is given. The
 * overflow menu's four groups land where a Mac user looks for them — the app
 * itself under GitOdile, the project under File, the window under View, and
 * help and the way out of trouble under Help. */
export function planAppMenu(labels: AppMenuLabels, state: AppMenuState): AppMenuSection[] {
  const free = !state.hasOpenDialog;
  const command = (commandId: AppMenuCommand, text: string, enabled = true): AppMenuEntry => ({
    kind: "command",
    command: commandId,
    text,
    enabled: free && enabled,
  });
  const native = (item: NativeMenuItem, text: string): AppMenuEntry => ({ kind: "native", item, text });

  return [
    {
      id: "app",
      text: "GitOdile",
      entries: [
        command("about", labels.about),
        command("check-updates", labels.checkUpdates),
        SEPARATOR,
        command("settings", labels.settings),
        SEPARATOR,
        native("Services", labels.services),
        SEPARATOR,
        native("Hide", labels.hide),
        native("HideOthers", labels.hideOthers),
        native("ShowAll", labels.showAll),
        SEPARATOR,
        native("Quit", labels.quit),
      ],
    },
    {
      id: "file",
      text: labels.file,
      entries: [
        command("home", labels.home),
        SEPARATOR,
        command(
          "open-project",
          state.isOpeningProject ? labels.openingProject : labels.openProject,
          !state.isOpeningProject,
        ),
        command("create-project", labels.createProject),
        command("clone-project", labels.cloneProject),
        SEPARATOR,
        // The overflow menu hides this row without a project; a menu bar keeps
        // its shape and greys the entry out instead.
        command("close-project", labels.closeProject, state.hasProject),
        native("CloseWindow", labels.closeWindow),
      ],
    },
    {
      id: "edit",
      text: labels.edit,
      // Not decoration: on macOS, ⌘C, ⌘V and ⌘A reach a text field through
      // these items. A menu bar without them leaves copy and paste dead.
      entries: [
        native("Undo", labels.undo),
        native("Redo", labels.redo),
        SEPARATOR,
        native("Cut", labels.cut),
        native("Copy", labels.copy),
        native("Paste", labels.paste),
        native("SelectAll", labels.selectAll),
      ],
    },
    {
      id: "view",
      text: labels.view,
      entries: [
        command("toggle-sidebar", state.isSidebarHidden ? labels.showSidebar : labels.hideSidebar),
        command("go-back", labels.goBack, state.canGoBack),
        command("go-forward", labels.goForward, state.canGoForward),
        SEPARATOR,
        command("reload-window", labels.reloadWindow, state.canReloadWindow),
        SEPARATOR,
        native("Fullscreen", labels.fullscreen),
      ],
    },
    {
      id: "window",
      text: labels.window,
      entries: [
        native("Minimize", labels.minimize),
        native("Maximize", labels.zoom),
        SEPARATOR,
        native("BringAllToFront", labels.bringAllToFront),
      ],
    },
    {
      id: "help",
      text: labels.help,
      entries: [
        command("keyboard-shortcuts", labels.keyboardShortcuts),
        command("whats-new", labels.whatsNew),
        SEPARATOR,
        command("report-issue", labels.reportIssue, !state.isReportingIssue),
      ],
    },
  ];
}

/** Whether the plan currently offers this command. Asked again on click,
 * because the native menu is updated asynchronously and can trail the app
 * by a render. */
export function isAppMenuCommandEnabled(sections: AppMenuSection[], command: AppMenuCommand): boolean {
  return sections.some((section) =>
    section.entries.some((entry) => entry.kind === "command" && entry.command === command && entry.enabled),
  );
}

/** Everything about a plan except what changes while the app runs, so a new
 * shape (a language switch) rebuilds the menu and a new state only updates
 * the entries in place. */
export function appMenuShape(sections: AppMenuSection[]): string {
  return JSON.stringify(
    sections.map((section) => ({
      text: section.text,
      entries: section.entries.map((entry) =>
        entry.kind === "command" ? { command: entry.command } : entry,
      ),
    })),
  );
}

export type NativeAppMenuHandle = {
  /** Applies each custom entry's text and enabled state. */
  update: (sections: AppMenuSection[]) => Promise<void>;
};

export type NativeAppMenuPort = {
  /** Replaces the application menu with this plan. */
  install: (
    sections: AppMenuSection[],
    onCommand: (command: AppMenuCommand) => void,
  ) => Promise<NativeAppMenuHandle>;
};

/** Keeps the macOS menu bar in step with the plan. Installs once per shape
 * and updates in place otherwise; calls are chained so a slow install never
 * receives an update meant for the menu that replaces it. */
export function useNativeAppMenu(
  port: NativeAppMenuPort | null,
  sections: AppMenuSection[],
  onCommand: (command: AppMenuCommand) => void,
): void {
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const queueRef = useRef<Promise<NativeAppMenuHandle | null>>(Promise.resolve(null));
  // The plan is rebuilt on every render; only a change in what it says may
  // reach the native menu. Without a port (every platform but macOS) there is
  // nothing to compare.
  const shape = port ? appMenuShape(sections) : "";
  const content = port ? JSON.stringify(sections) : "";

  useEffect(() => {
    if (!port) return;
    queueRef.current = queueRef.current
      .catch(() => null)
      .then(() => port.install(sectionsRef.current, (command) => onCommandRef.current(command)))
      .catch(() => null);
  }, [port, shape]);

  useEffect(() => {
    if (!port) return;
    queueRef.current = queueRef.current.then(async (handle) => {
      await handle?.update(sectionsRef.current).catch(() => undefined);
      return handle;
    });
  }, [port, content]);
}
