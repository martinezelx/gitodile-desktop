import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import type { WorkbenchTab } from "../../runtime/project/sessions";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { WorkbenchScreen } from "./WorkbenchScreen";

afterEach(cleanup);

function Harness({ initial = "changes", onTabChange }: { initial?: WorkbenchTab; onTabChange?: (tab: WorkbenchTab) => void }): React.JSX.Element {
  const [tab, setTab] = useState<WorkbenchTab>(initial);
  const [lifecycle] = useState(() => createScreenLifecycleController("active"));
  return (
    <LanguageProvider>
      <ScreenLifecycleProvider controller={lifecycle}>
        <WorkbenchScreen
          tab={tab}
          onTabChange={(next) => {
            onTabChange?.(next);
            setTab(next);
          }}
          renderChanges={(tabs) => (
            <section aria-label="Changes view">
              <header>{tabs}</header>
              <p>the file list</p>
            </section>
          )}
          renderHistory={(tabs) => (
            <section aria-label="History view">
              <header>{tabs}</header>
              <p>the timeline</p>
            </section>
          )}
        />
      </ScreenLifecycleProvider>
    </LanguageProvider>
  );
}

describe("WorkbenchScreen", () => {
  it("hands each view the tab pair, names the shown one, and keeps the other mounted but hidden", async () => {
    render(<Harness />);

    // The tabs are drawn by the view, in its own header — not above it.
    const changes = screen.getByRole("region", { name: "Changes view" });
    const tablist = screen.getByRole("tablist", { name: "Changes or history" });
    expect(changes.contains(tablist)).toBe(true);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Changes");
    expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "false");
    // The other view is not mounted until first shown.
    expect(screen.queryByText("the timeline")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "History" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("History");
    expect(screen.getByRole("region", { name: "History view" })).toBeInTheDocument();
    const historyPanel = screen.getByRole("tabpanel", { name: "History" });
    expect(historyPanel).not.toHaveAttribute("hidden");
    // Changes stays in the DOM, hidden and inert: no role query reaches it.
    expect(screen.queryByRole("region", { name: "Changes view" })).toBeNull();
    expect(screen.getByText("the file list").closest(".workbench__view")).toHaveAttribute("hidden");
    expect(screen.getByText("the file list").closest(".workbench__view")).toHaveAttribute("inert");
  });

  it("moves between the tabs from the keyboard in the WAI-ARIA shape", async () => {
    const onTabChange = vi.fn();
    render(<Harness onTabChange={onTabChange} />);

    // One tab in the tab order; the arrows select as they move.
    expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("tabindex", "-1");
    screen.getByRole("tab", { name: "Changes" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onTabChange).toHaveBeenLastCalledWith("history");
    expect(screen.getByRole("tab", { name: "History" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(onTabChange).toHaveBeenLastCalledWith("changes");
    await userEvent.keyboard("{End}");
    expect(onTabChange).toHaveBeenLastCalledWith("history");
    await userEvent.keyboard("{Home}");
    expect(onTabChange).toHaveBeenLastCalledWith("changes");
    expect(onTabChange).toHaveBeenCalledTimes(4);
  });
});
