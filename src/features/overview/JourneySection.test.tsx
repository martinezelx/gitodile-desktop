import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import type { Journey } from "./journey";
import { JourneySection } from "./JourneySection";

function journey(overrides: Partial<Journey> = {}): Journey {
  return {
    activeStep: "save",
    changes: { state: "dirty", total: 16, conflicted: 0 },
    save: { state: "active" },
    publish: {
      state: "upToDate",
      pending: 0,
      behind: 0,
      remoteLine: "origin/main",
      checkedAt: Date.now() - 5 * 60_000,
      isChecking: false,
      isStale: false,
      isCached: false,
      error: null,
      inventoryError: null,
    },
    ...overrides,
  };
}

function renderBand(value: Journey, overrides: Partial<React.ComponentProps<typeof JourneySection>> = {}) {
  const props = {
    journey: value,
    breakdown: [{ category: "changed" as const, count: 10 }, { category: "new" as const, count: 6 }],
    canPublish: true,
    onReviewChanges: vi.fn(),
    onCheckLocalChanges: vi.fn(),
    onSaveVersion: vi.fn(),
    onPublish: vi.fn(),
    onCheckTeamChanges: vi.fn(),
    onReviewAndGetTeamChanges: vi.fn(),
    onOpenProjectSettings: vi.fn(),
    onOpenHistory: vi.fn(),
    ...overrides,
  };
  render(
    <LanguageProvider>
      <ScreenLifecycleProvider controller={createScreenLifecycleController("active")}>
        <JourneySection {...props} />
      </ScreenLifecycleProvider>
    </LanguageProvider>,
  );
  return props;
}

afterEach(cleanup);

describe("JourneySection", () => {
  it("marks saving as the next step, with the one primary button, while the other tiles lead away", async () => {
    const user = userEvent.setup();
    const props = renderBand(journey());
    const steps = screen.getByRole("list", { name: "Where your work is" });

    // The active tile is the action: a button like its neighbours, marked as
    // the current step, saying what it does.
    const current = within(steps).getByRole("button", { name: "Save version" });
    expect(current).toHaveAttribute("aria-current", "step");
    expect(current.querySelector(".journey-step__value")).toHaveTextContent("Save version");
    expect(current.querySelector(".journey-step__hint")).toHaveTextContent("Keep what you have safe");
    await user.click(current);
    expect(props.onSaveVersion).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Save version" })).toBe(current);

    // The count and its breakdown, and the tile goes to Changes. The action
    // is the tile's name; the fact is what it is described by.
    expect(within(steps).getByText("16 unsaved changes")).toBeInTheDocument();
    expect(within(steps).getByRole("button", { name: "Review changes" })).toHaveAccessibleDescription(
      expect.stringContaining("16 unsaved changes"),
    );
    // One chip per category, with the Changes rows' own glyph in front.
    expect(within(steps).getByText("10 edited")).toBeInTheDocument();
    expect(within(steps).getByText("6 new").querySelector("svg")).not.toBeNull();
    await user.click(within(steps).getByRole("button", { name: "Review changes" }));
    expect(props.onReviewChanges).toHaveBeenCalledTimes(1);

    // Up to date is a fact, and pressing it re-checks.
    await user.click(within(steps).getByRole("button", { name: "Check remote project changes" }));
    expect(props.onCheckTeamChanges).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("status")).toHaveTextContent("Nothing leaves this computer until you publish.");
  });

  it("puts overlaps first and says so under the band", async () => {
    const user = userEvent.setup();
    const props = renderBand(
      journey({ activeStep: "changes", changes: { state: "conflicts", total: 3, conflicted: 2 }, save: { state: "blocked" } }),
      { breakdown: [{ category: "conflicted", count: 2 }, { category: "changed", count: 1 }] },
    );

    await user.click(screen.getByRole("button", { name: "Resolve overlaps" }));
    expect(props.onReviewChanges).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Resolve the overlaps first")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 files have overlapping changes");
  });

  it("hands publishing and getting to their own flows once everything is saved", async () => {
    const user = userEvent.setup();
    const ahead = renderBand(
      journey({
        activeStep: "publish",
        changes: { state: "clean", total: 0, conflicted: 0 },
        save: { state: "done" },
        publish: { ...journey().publish, state: "ahead", pending: 2 },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Publish all 2" }));
    expect(ahead.onPublish).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Publish all 2")).toBeInTheDocument();
    cleanup();

    const behind = renderBand(
      journey({
        activeStep: "publish",
        changes: { state: "clean", total: 0, conflicted: 0 },
        save: { state: "done" },
        publish: { ...journey().publish, state: "behind", behind: 1 },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Review and get" }));
    expect(behind.onReviewAndGetTeamChanges).toHaveBeenCalledTimes(1);
  });

  it("offers project settings when there is no remote, and says everything is done when it is", async () => {
    const user = userEvent.setup();
    const props = renderBand(
      journey({
        activeStep: null,
        changes: { state: "clean", total: 0, conflicted: 0 },
        save: { state: "done" },
        publish: { ...journey().publish, state: "noRemote", remoteLine: null },
      }),
    );
    // The tile and the line under the band both lead to settings.
    const settings = screen.getAllByRole("button", { name: "Project settings" });
    expect(settings).toHaveLength(2);
    await user.click(settings[0]);
    expect(props.onOpenProjectSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Add a remote project whenever you want to share it.");
    cleanup();

    renderBand(journey({ activeStep: null, changes: { state: "clean", total: 0, conflicted: 0 }, save: { state: "done" } }));
    expect(screen.getByRole("status")).toHaveTextContent("Everything is saved and published.");
    expect(screen.queryByRole("button", { name: "Save version" })).not.toBeInTheDocument();
  });
});
