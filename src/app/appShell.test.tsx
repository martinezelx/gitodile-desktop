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

    act(() => result.current[1]("dark"));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("gitodile-theme")).toBe("dark");
  });

  it("validates and persists navigation membership, order and display mode together", () => {
    localStorage.setItem(
      "gitodile-navigation-preferences",
      JSON.stringify({
        visibleDestinationIds: ["overview", "unknown", "overview"],
        destinationOrderIds: ["changes", "unknown", "changes"],
        displayMode: "icons-only",
      }),
    );
    const { result } = renderHook(() =>
      useStoredNavigationPreferences(["overview", "changes"]),
    );

    expect(result.current[0]).toEqual({
      visibleDestinationIds: ["overview"],
      destinationOrderIds: ["changes", "overview"],
      displayMode: "icons-only",
    });
    act(() =>
      result.current[1]({
        visibleDestinationIds: ["changes"],
        destinationOrderIds: ["changes", "overview"],
        displayMode: "icons-and-text",
      }),
    );
    expect(JSON.parse(localStorage.getItem("gitodile-navigation-preferences") ?? "null"))
      .toEqual({
        visibleDestinationIds: ["changes"],
        destinationOrderIds: ["changes", "overview"],
        displayMode: "icons-and-text",
      });
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
