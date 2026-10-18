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

  it("shows a newly registered Console before Recovery without moving a custom rail", () => {
    const current = ["overview", "workbench", "version-lines", "console", "recovery"];
    localStorage.setItem("gitodile-navigation-preferences", JSON.stringify({
      visibleDestinationIds: ["overview", "workbench", "version-lines", "recovery"],
      destinationOrderIds: ["overview", "workbench", "version-lines", "recovery"],
      displayMode: "icons-and-text",
    }));
    const oldDefault = renderHook(() => useStoredNavigationPreferences(current));
    expect(oldDefault.result.current[0].destinationOrderIds).toEqual(current);
    expect(oldDefault.result.current[0].visibleDestinationIds).toContain("console");
    oldDefault.unmount();

    localStorage.setItem("gitodile-navigation-preferences", JSON.stringify({
      visibleDestinationIds: ["overview", "version-lines", "recovery"],
      destinationOrderIds: ["version-lines", "overview", "workbench", "recovery"],
      displayMode: "icons-and-text",
    }));
    const custom = renderHook(() => useStoredNavigationPreferences(current));
    expect(custom.result.current[0].destinationOrderIds).toEqual(["version-lines", "overview", "workbench", "recovery", "console"]);
    expect(custom.result.current[0].visibleDestinationIds).toContain("console");
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
