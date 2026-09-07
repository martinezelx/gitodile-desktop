import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import type { VersionLine, VersionLinesSnapshot } from "./domain";
import { VersionLineQuickSwitch } from "./VersionLineQuickSwitch";

function line(name: string, options: Partial<VersionLine> = {}): VersionLine {
  return {
    name,
    tip: {
      commit: name.padEnd(40, "0").slice(0, 40),
      shortCommit: name.padEnd(7, "0").slice(0, 7),
      subject: `Latest saved work for ${name}`,
      committedAt: "2026-08-28T10:00:00Z",
    },
    isActive: false,
    upstream: null,
    isRetainedElsewhere: false,
    uniqueCommitCount: 1,
    worktreePath: null,
    upstreamAhead: null,
    upstreamBehind: null,
    upstreamGone: false,
    isDefault: false,
    ...options,
  };
}

const snapshot: VersionLinesSnapshot = {
  branch: "main",
  headState: "branch",
  currentCommit: "1111111111111111111111111111111111111111",
  lines: [
    line("main", { isActive: true, uniqueCommitCount: null }),
    ...Array.from({ length: 7 }, (_, index) => line(`feature/${index + 1}`)),
    line("feature/in-other-worktree", { worktreePath: "C:\\other" }),
  ],
  totalCount: 9,
  isTruncated: false,
  unreadableCount: 0,
};

afterEach(() => cleanup());

describe("VersionLineQuickSwitch", () => {
  it("offers a bounded, searchable dialog and returns only the chosen target", async () => {
    const onSwitch = vi.fn();
    const onSeeAll = vi.fn();
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          variant="status"
          onSwitch={onSwitch}
          onSeeAll={onSeeAll}
        />
      </LanguageProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Change version line (main)" });
    await userEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "Switch version line" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search version lines…" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "feature/7" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "feature/in-other-worktree" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "feature/2" }));
    expect(onSwitch).toHaveBeenCalledWith("feature/2");
    expect(screen.queryByRole("dialog", { name: "Switch version line" })).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("finds an eligible line beyond the initial status-bar rows", async () => {
    const onSwitch = vi.fn();
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          variant="status"
          onSwitch={onSwitch}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search version lines…" }), "feature/7");
    await userEvent.click(screen.getByRole("button", { name: "feature/7" }));
    expect(onSwitch).toHaveBeenCalledWith("feature/7");
  });

  it("keeps the status selector open while its own results scroll and shows commit context", async () => {
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          variant="status"
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    const dialog = screen.getByRole("dialog", { name: "Switch version line" });
    expect(screen.getByText("Latest saved work for feature/1")).toBeVisible();

    const results = dialog.querySelector(".version-lines-quick-switch__results");
    expect(results).not.toBeNull();
    fireEvent.scroll(results as HTMLElement);
    expect(dialog).toBeInTheDocument();

    fireEvent.scroll(document);
    expect(screen.queryByRole("dialog", { name: "Switch version line" })).not.toBeInTheDocument();
  });

  it("sorts favourites first and filters to them without closing the dialog", async () => {
    const favouriteLines = new Set(["feature/4"]);
    const onToggleFavourite = vi.fn();
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          favouriteLines={favouriteLines}
          onToggleFavourite={onToggleFavourite}
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    const lineButtons = screen.getAllByRole("button", { name: /^feature\/\d$/ });
    expect(lineButtons[0]).toHaveAccessibleName("feature/4");
    await userEvent.click(screen.getByRole("button", { name: "Add feature/2 to favourites" }));
    expect(onToggleFavourite).toHaveBeenCalledWith("feature/2");

    await userEvent.click(screen.getByRole("button", { name: "Show favourites only" }));
    expect(screen.getByRole("button", { name: "feature/4" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "feature/1" })).not.toBeInTheDocument();
  });

  it("renders a non-interactive line label when switching is unavailable", () => {
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="Specific saved version"
          canSwitch={false}
          variant="status"
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText("Specific saved version")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change version line/ })).not.toBeInTheDocument();
  });

  it("does not offer the session's current line while a cached snapshot catches up", async () => {
    const staleSnapshot: VersionLinesSnapshot = {
      ...snapshot,
      lines: snapshot.lines.map((entry) => ({ ...entry, isActive: entry.name === "feature/1" })),
    };
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={staleSnapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    expect(screen.queryByRole("button", { name: "main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "feature/1" })).not.toBeInTheDocument();
  });
});
