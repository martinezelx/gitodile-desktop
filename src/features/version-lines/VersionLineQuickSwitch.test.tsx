import { cleanup, render, screen } from "@testing-library/react";
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
      subject: name,
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
  it("offers a bounded, keyboard-accessible list and returns only the chosen target", async () => {
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

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(7);
    expect(screen.queryByRole("menuitem", { name: "main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "feature/7" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "feature/in-other-worktree" })).not.toBeInTheDocument();
    expect(items[0]).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSwitch).toHaveBeenCalledWith("feature/2");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
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
    expect(screen.queryByRole("menuitem", { name: "main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "feature/1" })).not.toBeInTheDocument();
  });
});
