import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RailNav, type RailNavItem } from "./RailNav";

function item(id: string, overrides: Partial<RailNavItem> = {}): RailNavItem {
  return {
    id,
    label: id,
    icon: null,
    isActive: false,
    isDisabled: false,
    isVisibleInRail: true,
    onSelect: vi.fn(),
    ...overrides,
  };
}

const items = [
  item("Overview"),
  item("Changes"),
  item("Version lines"),
  item("History"),
  item("Recovery", { isDisabled: true, disabledLabel: "Recovery — Coming soon" }),
];

const defaultResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = defaultResizeObserver;
});

function renderRail(overrides: Partial<React.ComponentProps<typeof RailNav>> = {}) {
  return render(
    <RailNav
      ariaLabel="Project navigation"
      moreLabel="More"
      customizeLabel="Customize navigation bar"
      items={items}
      displayMode="icons-and-text"
      onCustomize={vi.fn()}
      {...overrides}
    />,
  );
}

describe("RailNav", () => {
  it("keeps every destination in order and explains unavailable ones", async () => {
    renderRail();

    expect(
      within(screen.getByRole("navigation", { name: "Project navigation" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Overview", "Changes", "Version lines", "History", "Recovery", "More"]);
    const recovery = screen.getByRole("button", { name: "Recovery — Coming soon" });
    expect(recovery).toHaveAttribute("aria-disabled", "true");
    expect(recovery).toHaveAttribute("data-tooltip", "Recovery — Coming soon");
    await userEvent.click(recovery);
    expect(items[4].onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Project navigation" })).not.toHaveClass(
      "auto-hide-scrollbar",
    );
  });

  it("keeps More useful at full height through the navigation customization entry", async () => {
    const onCustomize = vi.fn();
    renderRail({ onCustomize });

    const more = screen.getByRole("button", { name: "More" });
    expect(more).toBeEnabled();
    await userEvent.click(more);

    const menu = screen.getByRole("menu", { name: "More" });
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Customize navigation bar" }),
    );
    expect(onCustomize).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu", { name: "More" })).not.toBeInTheDocument();
  });

  it("moves the destination suffix into More as the rail loses height", async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class CapturingResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = CapturingResizeObserver;
    const history = item("History", { isActive: true });
    renderRail({ items: [...items.slice(0, 3), history, items[4]] });

    const nav = screen.getByRole("navigation", { name: "Project navigation" });
    Object.defineProperty(nav, "clientHeight", { configurable: true, value: 190 });
    const measurements = Array.from(
      nav.querySelectorAll<HTMLElement>(".rail-nav__measure > .rail-item"),
    );
    for (const measurement of measurements) {
      Object.defineProperty(measurement, "offsetHeight", { configurable: true, value: 50 });
    }
    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });

    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Overview",
      "Changes",
      "More",
    ]);
    const more = within(nav).getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-current", "page");

    await userEvent.click(more);
    const menu = screen.getByRole("menu", { name: "More" });
    expect(within(menu).getAllByRole("menuitem").map((entry) => entry.textContent)).toEqual([
      "Version lines",
      "History",
      "Recovery — Coming soon",
      "Customize navigation bar",
    ]);
    expect(within(menu).getByRole("menuitem", { name: "Recovery — Coming soon" })).toBeDisabled();

    await userEvent.click(within(menu).getByRole("menuitem", { name: "History" }));
    expect(history.onSelect).toHaveBeenCalledOnce();
  });

  it("marks the active visible destination and runs it directly", async () => {
    const history = item("History", { isActive: true });
    renderRail({ items: [...items.slice(0, 3), history, items[4]] });

    const trigger = screen.getByRole("button", { name: "History" });
    expect(trigger).toHaveAttribute("aria-current", "page");
    await userEvent.click(trigger);
    expect(history.onSelect).toHaveBeenCalledOnce();
  });

  it("moves user-hidden destinations into More without removing access", async () => {
    const hiddenChanges = item("Changes", { isVisibleInRail: false });
    renderRail({ items: [items[0], hiddenChanges, ...items.slice(2)] });

    const nav = screen.getByRole("navigation", { name: "Project navigation" });
    expect(within(nav).queryByRole("button", { name: "Changes" })).toBeNull();
    await userEvent.click(within(nav).getByRole("button", { name: "More" }));
    await userEvent.click(
      within(screen.getByRole("menu", { name: "More" })).getByRole("menuitem", {
        name: "Changes",
      }),
    );
    expect(hiddenChanges.onSelect).toHaveBeenCalledOnce();
  });

  it("compacts to icons while keeping accessible destination names", () => {
    renderRail({ displayMode: "icons-only" });

    const nav = screen.getByRole("navigation", { name: "Project navigation" });
    expect(nav).toHaveClass("rail-nav--icons-only");
    const overview = within(nav).getByRole("button", { name: "Overview" });
    expect(overview).toBeInTheDocument();
    expect(overview).toHaveAttribute("data-tooltip", "Overview");
    expect(overview.querySelector(".rail-item__label")).toHaveAttribute("aria-hidden", "true");
    expect(within(nav).getByRole("button", { name: "More" })).toHaveAttribute(
      "data-tooltip",
      "More",
    );
  });
});
