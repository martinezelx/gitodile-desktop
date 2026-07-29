import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "./i18n";
import { App } from "./main";
import type { RepositoryInfo, WorkingTreeStatus } from "./repositoryOverview";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

function invokedPath(args: unknown): unknown {
  return args && typeof args === "object" && !Array.isArray(args)
    ? Reflect.get(args, "path")
    : undefined;
}

const restoredProject: RepositoryInfo = {
  name: "restored-project",
  path: "C:\\projects\\restored-project",
  selectedPath: "C:\\projects\\restored-project",
  gitDir: "C:\\projects\\restored-project\\.git",
  commonGitDir: "C:\\projects\\restored-project\\.git",
  branch: "main",
  headState: "branch",
  kind: "repository",
};

const cleanStatus: WorkingTreeStatus = {
  isClean: true,
  counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0 },
  entries: [],
  truncated: false,
  hasPreparedChanges: false,
  hasUnpreparedChanges: false,
  upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
};

const secondProject: RepositoryInfo = {
  ...restoredProject,
  name: "second-project",
  path: "C:\\projects\\second-project",
  selectedPath: "C:\\projects\\second-project",
  gitDir: "C:\\projects\\second-project\\.git",
  commonGitDir: "C:\\projects\\second-project\\.git",
};

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App project restoration", () => {
  it("does not overwrite stored projects before startup revalidation completes", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodrile-projects",
      JSON.stringify({
        version: 1,
        order: [restoredProject.path],
        activeId: restoredProject.path,
      }),
    );

    let resolveOpen: ((project: RepositoryInfo) => void) | undefined;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return new Promise<RepositoryInfo>((resolve) => {
          resolveOpen = resolve;
        });
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("open_repository", {
        path: restoredProject.path,
      }),
    );
    expect(JSON.parse(localStorage.getItem("gitodrile-projects") ?? "{}")).toEqual({
      version: 1,
      order: [restoredProject.path],
      activeId: restoredProject.path,
    });

    resolveOpen?.(restoredProject);
    expect(
      await screen.findByRole("heading", { name: restoredProject.name }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("gitodrile-projects") ?? "{}")).toEqual({
        version: 1,
        order: [restoredProject.path],
        activeId: restoredProject.path,
      }),
    );
  });

  it("refreshes a project's local status whenever it becomes active", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodrile-projects",
      JSON.stringify({
        version: 1,
        order: [restoredProject.path, secondProject.path],
        activeId: restoredProject.path,
      }),
    );

    mockedInvoke.mockImplementation((command, args) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(
          invokedPath(args) === secondProject.path ? secondProject : restoredProject,
        );
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    await waitFor(() =>
      expect(
        mockedInvoke.mock.calls.filter(
          ([command, args]) =>
            command === "read_working_tree_status" &&
            invokedPath(args) === secondProject.path,
        ),
      ).toHaveLength(1),
    );

    await userEvent.click(screen.getByRole("button", { name: secondProject.name }));

    await waitFor(() =>
      expect(
        mockedInvoke.mock.calls.filter(
          ([command, args]) =>
            command === "read_working_tree_status" &&
            invokedPath(args) === secondProject.path,
        ),
      ).toHaveLength(2),
    );
  });
});
