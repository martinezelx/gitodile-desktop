import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { CommandPalette } from "./CommandPalette";
import {
  useStoredBoolean,
  useStoredNavigationPreferences,
  useThemePreference,
} from "./preferences";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => cleanup());

describe("application-shell preferences", () => {
  it("persists boolean preferences through the shared hook", () => {
    const { result } = renderHook(() => useStoredBoolean("test-preference", false));

    act(() => result.current[1]((current) => !current));

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem("test-preference")).toBe("true");
  });

  it("applies and persists the selected theme", () => {
    const { result } = renderHook(() => useThemePreference());

    act(() => result.current[1]("gitodile-dark"));

    expect(document.documentElement.dataset.theme).toBe("gitodile-dark");
    expect(localStorage.getItem("gitodile-theme")).toBe("gitodile-dark");
  });

  // The stored values predate the theme registry; the read upgrades them once,
  // and anything unrecognised falls back to following the device.
  it("migrates a stored light/dark theme and rejects an unknown one", () => {
    localStorage.setItem("gitodile-theme", "dark");
    const migrated = renderHook(() => useThemePreference());
    expect(migrated.result.current[0]).toBe("gitodile-dark");
    expect(localStorage.getItem("gitodile-theme")).toBe("gitodile-dark");

    localStorage.setItem("gitodile-theme", "solarized");
    const invalid = renderHook(() => useThemePreference());
    expect(invalid.result.current[0]).toBe("system");
  });

  it("validates and persists navigation membership, order and display mode together", () => {
    localStorage.setItem(
      "gitodile-navigation-preferences",
      JSON.stringify({
        visibleDestinationIds: ["overview", "unknown", "overview"],
        destinationOrderIds: ["workbench", "unknown", "workbench"],
        displayMode: "icons-only",
      }),
    );
    const { result } = renderHook(() =>
      useStoredNavigationPreferences(["overview", "workbench"]),
    );

    expect(result.current[0]).toEqual({
      visibleDestinationIds: ["overview"],
      destinationOrderIds: ["workbench", "overview"],
      displayMode: "icons-only",
    });
    act(() =>
      result.current[1]({
        visibleDestinationIds: ["workbench"],
        destinationOrderIds: ["workbench", "overview"],
        displayMode: "icons-and-text",
      }),
    );
    expect(JSON.parse(localStorage.getItem("gitodile-navigation-preferences") ?? "null"))
      .toEqual({
        visibleDestinationIds: ["workbench"],
        destinationOrderIds: ["workbench", "overview"],
        displayMode: "icons-and-text",
      });
  });

  // Every session writes the whole snapshot back, so each old default order
  // was already in storage for everyone by the time the next one shipped. A
  // stored order identical to a superseded default is the absence of a
  // choice, not one.
  it("adopts the current rail order when the stored one is a superseded default", () => {
    const current = ["overview", "workbench", "version-lines", "recovery"];
    for (const superseded of [
      ["overview", "changes", "version-lines", "history", "recovery"],
      ["overview", "changes", "history", "version-lines", "recovery"],
    ]) {
      localStorage.setItem(
        "gitodile-navigation-preferences",
        JSON.stringify({
          visibleDestinationIds: superseded,
          destinationOrderIds: superseded,
          displayMode: "icons-and-text",
        }),
      );

      const { result } = renderHook(() => useStoredNavigationPreferences(current));

      expect(result.current[0].destinationOrderIds).toEqual(current);
      expect(result.current[0].visibleDestinationIds).toEqual(current);
    }
  });

  it("keeps an arrangement the user actually made", () => {
    const current = ["overview", "workbench", "version-lines", "recovery"];
    localStorage.setItem(
      "gitodile-navigation-preferences",
      JSON.stringify({
        visibleDestinationIds: current,
        destinationOrderIds: ["version-lines", "overview", "workbench", "recovery"],
        displayMode: "icons-and-text",
      }),
    );

    const { result } = renderHook(() => useStoredNavigationPreferences(current));

    expect(result.current[0].destinationOrderIds)
      .toEqual(["version-lines", "overview", "workbench", "recovery"]);
  });

  // Changes and History became the two tabs of Work (task 126). An
  // arrangement made by hand keeps its shape: Work takes the place Changes
  // held, History drops out, and a hidden Changes stays hidden as Work.
  it("folds a stored Changes and History into Work in place", () => {
    const current = ["overview", "workbench", "version-lines", "recovery"];
    localStorage.setItem(
      "gitodile-navigation-preferences",
      JSON.stringify({
        visibleDestinationIds: ["overview", "history", "version-lines"],
        destinationOrderIds: ["history", "version-lines", "changes", "overview", "recovery"],
        displayMode: "icons-and-text",
      }),
    );

    const { result } = renderHook(() => useStoredNavigationPreferences(current));

    expect(result.current[0].destinationOrderIds)
      .toEqual(["version-lines", "workbench", "overview", "recovery"]);
    expect(result.current[0].visibleDestinationIds).toEqual(["overview", "version-lines"]);
  });
});

describe("CommandPalette", () => {
  it("filters commands and runs the selected result from the keyboard", async () => {
    const user = userEvent.setup();
    const openProject = vi.fn();
    const openSettings = vi.fn();
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <CommandPalette
          isOpen
          onClose={onClose}
          commands={[
            { id: "project", label: "Open project", action: openProject },
            { id: "settings", label: "Settings", action: openSettings },
          ]}
        />
      </LanguageProvider>,
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "settings{Enter}");

    expect(openProject).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes before running an action and dismisses when the project context changes", async () => {
    const user = userEvent.setup();
    const events: string[] = [];
    const onClose = vi.fn(() => events.push("close"));
    const { rerender } = render(
      <LanguageProvider>
        <CommandPalette
          isOpen
          onClose={onClose}
          contextKey="project-a"
          commands={[{ id: "switch", label: "Switch project", action: () => events.push("action") }]}
        />
      </LanguageProvider>,
    );

    await user.keyboard("{Enter}");
    expect(events).toEqual(["close", "action"]);

    onClose.mockClear();
    rerender(
      <LanguageProvider>
        <CommandPalette
          isOpen
          onClose={onClose}
          contextKey="project-b"
          commands={[]}
        />
      </LanguageProvider>,
    );

    expect(onClose).toHaveBeenCalledOnce();
  });
});
