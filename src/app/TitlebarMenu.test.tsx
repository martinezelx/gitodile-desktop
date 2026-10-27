import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
