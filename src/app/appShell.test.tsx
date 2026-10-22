import { act, cleanup, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { House, Sparkles } from "lucide-react";
import { LanguageProvider } from "../i18n";
import { CommandPalette, type AppCommand } from "./CommandPalette";
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

    localStorage.setItem("gitodile-theme", "catppuccin-macchiato");
    const retired = renderHook(() => useThemePreference());
    expect(retired.result.current[0]).toBe("catppuccin-mocha");

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

  it("keeps an arrangement the user actually made", () => {
    const current = ["overview", "workbench", "branches", "recovery"];
    localStorage.setItem(
      "gitodile-navigation-preferences",
      JSON.stringify({
        visibleDestinationIds: current,
        destinationOrderIds: ["branches", "overview", "workbench", "recovery"],
        displayMode: "icons-and-text",
      }),
    );

    const { result } = renderHook(() => useStoredNavigationPreferences(current));

    expect(result.current[0].destinationOrderIds)
      .toEqual(["branches", "overview", "workbench", "recovery"]);
  });

});

describe("CommandPalette", () => {
  const matches: AppCommand[] = [
    { id: "go-home", label: "Go to Home", group: "Go", icon: <House aria-hidden="true" />, action: vi.fn() },
    {
      id: "changelog",
      label: "What's new",
      group: "App",
      icon: <Sparkles aria-hidden="true" />,
      hint: "⌘L",
      action: vi.fn(),
    },
  ];
  const renderPanel = (overrides: {
    matches?: readonly AppCommand[];
    selectedIndex?: number;
    onSelect?: (command: AppCommand) => void;
    onHover?: (index: number) => void;
  } = {}) =>
    render(
      <LanguageProvider>
        <CommandPalette
          isOpen
          matches={overrides.matches ?? matches}
          selectedIndex={overrides.selectedIndex ?? 0}
          anchorRef={{ current: null }}
          onSelect={overrides.onSelect ?? vi.fn()}
          onHover={overrides.onHover ?? vi.fn()}
        />
      </LanguageProvider>,
    );

  it("lists the matches under their sections, with the selection and the keys at its foot", () => {
    renderPanel();

    const listbox = screen.getByRole("listbox", { name: "Command palette" });
    expect(within(listbox).getByText("Go")).toBeInTheDocument();
    expect(within(listbox).getByText("App")).toBeInTheDocument();
    expect(within(listbox).getAllByRole("option")).toHaveLength(2);
    expect(within(listbox).getByRole("option", { name: "Go to Home" })).toHaveAttribute("aria-selected", "true");
    expect(within(listbox).getByRole("option", { name: /What's new/ })).toHaveAttribute("aria-selected", "false");
    // The shortcut rides the row; the keys the results answer to ride the foot.
    expect(screen.getByText("⌘L")).toBeInTheDocument();
    expect(screen.getByText("move")).toBeInTheDocument();
  });

  it("chooses a result on a press and reports the pointer's row", async () => {
    const onSelect = vi.fn();
    const onHover = vi.fn();
    renderPanel({ onSelect, onHover });

    await userEvent.hover(screen.getByRole("option", { name: /What's new/ }));
    expect(onHover).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole("option", { name: /What's new/ }));
    expect(onSelect).toHaveBeenCalledWith(matches[1]);
  });

  it("says so when nothing matches", () => {
    renderPanel({ matches: [] });

    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });
});
