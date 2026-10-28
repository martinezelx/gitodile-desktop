import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "./translations.en";
import { es } from "./translations.es";
import {
  appMenuShape,
  isAppMenuCommandEnabled,
  planAppMenu,
  useNativeAppMenu,
  type AppMenuCommand,
  type AppMenuEntry,
  type AppMenuLabels,
  type AppMenuSection,
  type AppMenuState,
  type NativeAppMenuPort,
} from "./nativeAppMenu";

afterEach(cleanup);

function labelsFor(language: "en" | "es"): AppMenuLabels {
  const t = { en, es }[language];
  return {
    about: "About GitOdile",
    checkUpdates: "Check for updates",
    settings: t.appMenuSettings,
    home: "Home",
    openProject: t.titlebarOpenProject,
    openingProject: "Opening…",
    createProject: t.titlebarCreateProject,
    cloneProject: t.titlebarCloneProject,
    closeProject: "Close project",
    hideSidebar: "Hide sidebar",
    showSidebar: "Show sidebar",
    goBack: "Go back",
    goForward: "Go forward",
    reloadWindow: t.titlebarReloadWindow,
    keyboardShortcuts: "Keyboard shortcuts",
    whatsNew: "What's new",
    reportIssue: t.titlebarReportIssue,
    file: t.appMenuFile,
    edit: t.appMenuEdit,
    view: t.appMenuView,
    window: t.appMenuWindow,
    help: t.appMenuHelp,
    services: t.appMenuServices,
    hide: t.appMenuHide,
    hideOthers: t.appMenuHideOthers,
    showAll: t.appMenuShowAll,
    quit: t.appMenuQuit,
    closeWindow: t.appMenuCloseWindow,
    undo: t.appMenuUndo,
    redo: t.appMenuRedo,
    cut: t.appMenuCut,
    copy: t.appMenuCopy,
    paste: t.appMenuPaste,
    selectAll: t.appMenuSelectAll,
    fullscreen: t.appMenuFullscreen,
    minimize: t.appMenuMinimize,
    zoom: t.appMenuZoom,
    bringAllToFront: t.appMenuBringAllToFront,
  };
}

const idle: AppMenuState = {
  hasProject: true,
  isOpeningProject: false,
  canReloadWindow: true,
  isReportingIssue: false,
  isSidebarHidden: false,
  canGoBack: true,
  canGoForward: true,
  hasOpenDialog: false,
};

function commands(sections: AppMenuSection[]): Array<Extract<AppMenuEntry, { kind: "command" }>> {
  return sections.flatMap((section) =>
    section.entries.filter((entry): entry is Extract<AppMenuEntry, { kind: "command" }> => entry.kind === "command"),
  );
}

function command(sections: AppMenuSection[], id: AppMenuCommand) {
  const entry = commands(sections).find((candidate) => candidate.command === id);
  if (!entry) throw new Error(`missing ${id}`);
  return entry;
}

describe("planAppMenu", () => {
  it("lays out the standard macOS menus and keeps every overflow-menu action", () => {
    const sections = planAppMenu(labelsFor("en"), idle);
    expect(sections.map((section) => section.text)).toEqual(["GitOdile", "File", "Edit", "View", "Window", "Help"]);
    expect(commands(sections).map((entry) => entry.command).sort()).toEqual(
      [
        "about",
        "check-updates",
        "settings",
        "home",
        "open-project",
        "create-project",
        "clone-project",
        "close-project",
        "toggle-sidebar",
        "go-back",
        "go-forward",
        "reload-window",
        "keyboard-shortcuts",
        "whats-new",
        "report-issue",
      ].sort(),
    );
    expect(commands(sections).every((entry) => entry.enabled)).toBe(true);
  });

  it("keeps the Edit menu that copy and paste depend on", () => {
    const edit = planAppMenu(labelsFor("en"), idle).find((section) => section.id === "edit");
    const natives = edit?.entries.flatMap((entry) => (entry.kind === "native" ? [entry.item] : []));
    expect(natives).toEqual(["Undo", "Redo", "Cut", "Copy", "Paste", "SelectAll"]);
  });

  it("disables entries the titlebar would disable or hide", () => {
    const sections = planAppMenu(labelsFor("en"), {
      ...idle,
      hasProject: false,
      isOpeningProject: true,
      canReloadWindow: false,
      isReportingIssue: true,
      canGoBack: false,
      canGoForward: false,
    });
    for (const id of ["close-project", "open-project", "reload-window", "report-issue", "go-back", "go-forward"] as const) {
      expect(command(sections, id).enabled).toBe(false);
    }
    expect(command(sections, "open-project").text).toBe("Opening…");
    expect(command(sections, "home").enabled).toBe(true);
  });

  it("turns every custom entry off while a dialog owns the screen", () => {
    const sections = planAppMenu(labelsFor("en"), { ...idle, hasOpenDialog: true });
    expect(commands(sections).some((entry) => entry.enabled)).toBe(false);
  });

  it("answers whether a command is on offer at click time", () => {
    expect(isAppMenuCommandEnabled(planAppMenu(labelsFor("en"), idle), "go-back")).toBe(true);
    expect(isAppMenuCommandEnabled(planAppMenu(labelsFor("en"), { ...idle, canGoBack: false }), "go-back")).toBe(false);
    expect(isAppMenuCommandEnabled(planAppMenu(labelsFor("en"), { ...idle, hasOpenDialog: true }), "about")).toBe(false);
  });

  it("names the sidebar entry after what it will do", () => {
    expect(command(planAppMenu(labelsFor("en"), idle), "toggle-sidebar").text).toBe("Hide sidebar");
    expect(command(planAppMenu(labelsFor("en"), { ...idle, isSidebarHidden: true }), "toggle-sidebar").text).toBe(
      "Show sidebar",
    );
  });

  it("changes shape with the language but not with the state", () => {
    const english = appMenuShape(planAppMenu(labelsFor("en"), idle));
    expect(appMenuShape(planAppMenu(labelsFor("en"), { ...idle, hasOpenDialog: true, isSidebarHidden: true }))).toBe(
      english,
    );
    const spanish = planAppMenu(labelsFor("es"), idle);
    expect(appMenuShape(spanish)).not.toBe(english);
    expect(spanish.map((section) => section.text)).toEqual(["GitOdile", "Archivo", "Edición", "Visualización", "Ventana", "Ayuda"]);
  });
});

describe("useNativeAppMenu", () => {
  function fakePort() {
    const update = vi.fn(async (_sections: AppMenuSection[]) => undefined);
    let onCommand: ((command: AppMenuCommand) => void) | null = null;
    const install = vi.fn(async (_sections: AppMenuSection[], handler: (command: AppMenuCommand) => void) => {
      onCommand = handler;
      return { update };
    });
    const port: NativeAppMenuPort = { install };
    return { port, install, update, fire: (command: AppMenuCommand) => onCommand?.(command) };
  }

  function Harness(props: { port: NativeAppMenuPort | null; sections: AppMenuSection[]; onCommand: (command: AppMenuCommand) => void }) {
    useNativeAppMenu(props.port, props.sections, props.onCommand);
    return null;
  }

  it("installs once, updates in place, and reinstalls for a new language", async () => {
    const { port, install, update, fire } = fakePort();
    const first = vi.fn();
    const view = render(<Harness port={port} sections={planAppMenu(labelsFor("en"), idle)} onCommand={first} />);
    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));

    const second = vi.fn();
    const busy = planAppMenu(labelsFor("en"), { ...idle, hasOpenDialog: true });
    view.rerender(<Harness port={port} sections={busy} onCommand={second} />);
    await waitFor(() => expect(update).toHaveBeenLastCalledWith(busy));
    expect(install).toHaveBeenCalledTimes(1);

    // The latest handler runs, not the one the menu was built with.
    fire("settings");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("settings");

    view.rerender(<Harness port={port} sections={planAppMenu(labelsFor("es"), idle)} onCommand={second} />);
    await waitFor(() => expect(install).toHaveBeenCalledTimes(2));
  });

  it("does nothing without a port", () => {
    const { install } = fakePort();
    render(<Harness port={null} sections={planAppMenu(labelsFor("en"), idle)} onCommand={vi.fn()} />);
    expect(install).not.toHaveBeenCalled();
  });
});
