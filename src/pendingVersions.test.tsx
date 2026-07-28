import type React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "./i18n";
import { PendingVersionsSection } from "./pendingVersions";
import type { PendingVersionsResult, SavedVersionSummary } from "./publish";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

const versions: SavedVersionSummary[] = [
  { commit: "aaa111", shortCommit: "aaa111", description: "fix the thing" },
  { commit: "bbb222", shortCommit: "bbb222", description: "add the other thing" },
];
const result: PendingVersionsResult = { totalCount: 2, versions, isTruncated: false };

function renderSection(overrides: Partial<React.ComponentProps<typeof PendingVersionsSection>> = {}) {
  const onPublishUpTo = vi.fn();
  const onRetry = vi.fn();
  const utils = render(
    <LanguageProvider>
      <PendingVersionsSection
        projectPath="/repo"
        result={result}
        error={null}
        onRetry={onRetry}
        onPublishUpTo={onPublishUpTo}
        {...overrides}
      />
    </LanguageProvider>,
  );
  return { onPublishUpTo, onRetry, ...utils };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PendingVersionsSection", () => {
  it("lists every pending version with its description and hash, with a count in the title, without fetching anything", () => {
    renderSection();

    expect(screen.getByText("Saved versions not yet published (2)")).toBeInTheDocument();
    expect(
      screen.getByText("Newest first. Publishing through a version also publishes every older version below it."),
    ).toBeInTheDocument();
    expect(screen.getByText("fix the thing")).toBeInTheDocument();
    expect(screen.getByText("add the other thing")).toBeInTheDocument();
    expect(screen.getByText("aaa111")).toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("loads and shows a version's changed files only once it is expanded", async () => {
    renderSection();

    mockedInvoke.mockResolvedValueOnce([
      { path: "src/foo.ts", originalPath: null, category: "changed" },
      { path: "src/new.ts", originalPath: null, category: "new" },
    ]);
    await userEvent.click(screen.getByText("fix the thing"));

    expect(await screen.findByText("src/foo.ts")).toBeInTheDocument();
    expect(screen.getByText("src/new.ts")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("read_commit_file_changes", { path: "/repo", commit: "aaa111" });

    // Collapsing and reopening must not refetch — cached per commit.
    await userEvent.click(screen.getByText("fix the thing"));
    await userEvent.click(screen.getByText("fix the thing"));
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("shows an error state when the file list fails to load", async () => {
    renderSection();

    mockedInvoke.mockRejectedValueOnce(new Error("boom"));
    await userEvent.click(screen.getByText("fix the thing"));

    expect(await screen.findByText("Couldn't load the changed files.")).toBeInTheDocument();
  });

  it("loads a file's line changes on selection and reuses the cached diff", async () => {
    renderSection();

    mockedInvoke
      .mockResolvedValueOnce([{ path: "src/foo.ts", originalPath: null, category: "changed" }])
      .mockResolvedValueOnce({
        kind: "unchanged",
        path: "src/foo.ts",
        originalPath: null,
        change: "changed",
      });

    await userEvent.click(screen.getByText("fix the thing"));
    const fileButton = await screen.findByRole("button", { name: "src/foo.ts" });
    await userEvent.click(fileButton);

    expect(await screen.findByText("No content changed")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenLastCalledWith("read_commit_file_diff", {
      path: "/repo",
      commit: "aaa111",
      filePath: "src/foo.ts",
    });

    await userEvent.click(fileButton);
    expect(screen.queryByText("No content changed")).not.toBeInTheDocument();
    await userEvent.click(fileButton);
    expect(screen.getByText("No content changed")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it("shows an error state when a file's line changes fail to load", async () => {
    renderSection();

    mockedInvoke
      .mockResolvedValueOnce([{ path: "src/foo.ts", originalPath: null, category: "changed" }])
      .mockRejectedValueOnce(new Error("boom"));

    await userEvent.click(screen.getByText("fix the thing"));
    await userEvent.click(await screen.findByRole("button", { name: "src/foo.ts" }));

    expect(await screen.findByText("Couldn't load this file's line changes.")).toBeInTheDocument();
  });

  it("sizes a text diff to its visible lines instead of reserving the maximum height", async () => {
    renderSection();

    mockedInvoke
      .mockResolvedValueOnce([{ path: "notes.md", originalPath: null, category: "new" }])
      .mockResolvedValueOnce({
        kind: "text",
        path: "notes.md",
        originalPath: null,
        change: "new",
        truncated: false,
        hunks: [
          {
            header: "@@ -0,0 +1,3 @@",
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 3,
            lines: [
              { kind: "addition", content: "# Notes", oldLineNumber: null, newLineNumber: 1 },
              { kind: "addition", content: "", oldLineNumber: null, newLineNumber: 2 },
              { kind: "addition", content: "A short note.", oldLineNumber: null, newLineNumber: 3 },
            ],
          },
        ],
      });

    await userEvent.click(screen.getByText("fix the thing"));
    await userEvent.click(await screen.findByRole("button", { name: "notes.md" }));

    await waitFor(() => expect(document.querySelector(".pending-versions__diff")).toHaveStyle({ height: "84px" }));
  });

  it("the publish-up-to button targets the right commit without toggling the row open", async () => {
    const { onPublishUpTo } = renderSection();

    await userEvent.click(screen.getAllByRole("button", { name: "Publish up to here" })[0]);

    expect(onPublishUpTo).toHaveBeenCalledWith("aaa111");
    // The row's own file list never fetches — proof the click never toggled
    // `<details>` open, only the fetch would have fired that request.
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("shows the true total when the preview is truncated", () => {
    renderSection({
      result: { totalCount: 83, versions, isTruncated: true },
    });

    expect(screen.getByText("Saved versions not yet published (83)")).toBeInTheDocument();
    expect(screen.getByText("Showing the 2 newest of 83.")).toBeInTheDocument();
  });

  it("shows a recoverable loading error without hiding the last known versions", async () => {
    const { onRetry } = renderSection({ error: "Couldn't refresh pending versions." });

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't refresh pending versions.");
    expect(screen.getByText("fix the thing")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
