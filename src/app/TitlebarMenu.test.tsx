import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../i18n";
import { TitlebarMenu } from "./TitlebarMenu";

afterEach(cleanup);

describe("TitlebarMenu outside presses", () => {
  it("closes on the titlebar before Tauri consumes the bubbling mousedown", () => {
    // Tauri installs its document listener before React mounts, and calls
    // stopImmediatePropagation when the press starts a native window drag.
    const nativeDrag = vi.fn((event: MouseEvent) => {
      if (event.target instanceof HTMLElement && event.target.hasAttribute("data-tauri-drag-region")) {
        event.stopImmediatePropagation();
      }
    });
    document.addEventListener("mousedown", nativeDrag);
    try {
      const noop = (): void => undefined;
      render(<LanguageProvider>
        <div data-tauri-drag-region data-testid="titlebar-drag" />
        <TitlebarMenu
          onOpenHome={noop} onOpenAbout={noop} onOpenChangelog={noop} onOpenProject={noop}
          onCreateProject={noop} onCloneProject={noop} onCloseProject={noop} onOpenSettings={noop}
          onOpenShortcuts={noop} hasProject={false} isOpeningProject={false} canReloadWindow
          onReportIssue={noop} isReportingIssue={false}
        />
      </LanguageProvider>);
      fireEvent.click(screen.getByRole("button", { name: "More actions" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId("titlebar-drag"), { button: 0, detail: 1 });

      expect(nativeDrag).toHaveBeenCalledOnce();
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      document.removeEventListener("mousedown", nativeDrag);
    }
  });
});

describe("TitlebarMenu", () => {
  function renderMenu(overrides: Partial<React.ComponentProps<typeof TitlebarMenu>> = {}) {
    const props: React.ComponentProps<typeof TitlebarMenu> = {
      onOpenHome: vi.fn(),
      onOpenAbout: vi.fn(),
      onOpenChangelog: vi.fn(),
      onOpenProject: vi.fn(),
      onCreateProject: vi.fn(),
      onCloneProject: vi.fn(),
      onCloseProject: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenShortcuts: vi.fn(),
      hasProject: true,
      isOpeningProject: false,
      canReloadWindow: true,
      onReportIssue: vi.fn(),
      isReportingIssue: false,
      ...overrides,
    };
    render(
      <LanguageProvider>
        <TitlebarMenu {...props} />
      </LanguageProvider>,
    );
    return props;
  }

  it("implements the expected menu keyboard navigation and restores focus", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "More actions" });

    await user.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Home");
    expect(items[0]).toHaveFocus();

    await user.keyboard("{End}");
    expect(items.at(-1)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(items.at(-1)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("menuitem").at(-1)).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("restores the trigger before running a menu action", async () => {
    const user = userEvent.setup();
    const onOpenShortcuts = vi.fn(() => {
      expect(screen.getByRole("button", { name: "More actions" })).toHaveFocus();
    });
    renderMenu({ onOpenShortcuts });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Keyboard shortcuts" }));

    expect(onOpenShortcuts).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens Projects from the first menu item", async () => {
    const user = userEvent.setup();
    const onOpenHome = vi.fn();
    renderMenu({ onOpenHome });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.keyboard("{Enter}");
    expect(onOpenHome).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("offers provider-neutral cloning from the titlebar menu", async () => {
    const user = userEvent.setup();
    const onCloneProject = vi.fn();
    renderMenu({ onCloneProject });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clone remote project…" }));

    expect(onCloneProject).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("offers local project creation from the titlebar menu", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    renderMenu({ onCreateProject });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Create local project…" }));

    expect(onCreateProject).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("groups the app's own entries, with the changelog first and About last", async () => {
    const user = userEvent.setup();
    const onOpenChangelog = vi.fn();
    renderMenu({ onOpenChangelog });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const names = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(names.slice(-5)).toEqual(["What's new", "Check for updates", "About GitOdile", "Report an issue", "Reload window"]);

    await user.click(screen.getByRole("menuitem", { name: "What's new" }));
    expect(onOpenChangelog).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("starts the shared application-update flow from More actions", async () => {
    const user = userEvent.setup();
    const onCheckAppUpdates = vi.fn();
    renderMenu({ onCheckAppUpdates });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Check for updates" }));
    expect(onCheckAppUpdates).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps reload focusable but unavailable while an operation is unsettled", async () => {
    const user = userEvent.setup();
    renderMenu({ canReloadWindow: false });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const reload = screen.getByRole("menuitem", { name: /Reload window.*Wait for the current operation to finish/ });
    expect(reload).toHaveAttribute("aria-disabled", "true");
    await user.click(reload);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
