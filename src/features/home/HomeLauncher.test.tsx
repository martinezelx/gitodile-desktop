import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { createRepositoryBrowserController, type RepositoryBrowserPort } from "../repository-browser";
import type { HomeAccount, HomeSetup } from "./launcher";
import { HomeLauncher, type HomeRecentEntry, type HomeLauncherProps } from "./HomeLauncher";

const readySetup: HomeSetup = {
  git: { state: "available", version: "2.50.0", isRechecking: false },
  identity: { name: "Luis Muñoz", email: "luis@example.com" },
  accounts: [{ id: "github:luis-m", kind: "github", login: "luis-m", source: "connection", server: null }],
};

const recents: HomeRecentEntry[] = [
  { path: "C:\\dev\\portfolio-web", name: "portfolio-web", isFavourite: false, openedAt: Date.now() - 600_000 },
  { path: "C:\\workspace\\gitodile", name: "gitodile", isFavourite: true },
  { path: "D:\\uni\\tfg-robotica", name: "tfg-robotica", isFavourite: false },
  { path: "C:\\games\\pixel-dungeon", name: "pixel-dungeon", isFavourite: false },
];

function renderLauncher(overrides: Partial<HomeLauncherProps> = {}) {
  const props: HomeLauncherProps = {
    isOpening: false,
    recentProjects: recents,
    userName: "Luis Muñoz Martínez",
    onOpenProject: vi.fn(),
    onCreateProject: vi.fn(),
    onCloneProject: vi.fn(),
    onOpenRecentProject: vi.fn(),
    onCloneFromUrl: vi.fn(),
    onCreateNamedProject: vi.fn(),
    onToggleFavouriteRecentProject: vi.fn(),
    onForgetRecentProject: vi.fn(),
    playGreeting: false,
    ...overrides,
  };
  const lifecycle = createScreenLifecycleController("active");
  render(
    <LanguageProvider>
      <ScreenLifecycleProvider controller={lifecycle}>
        <HomeLauncher {...props} />
      </ScreenLifecycleProvider>
    </LanguageProvider>,
  );
  return { props, lifecycle, field: screen.getByRole("textbox", { name: "Find a project, or paste a path or URL" }) };
}

describe("HomeLauncher", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("greets by the Git name's first word and asks a question for the time of day", () => {
    renderLauncher();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Luis$/);
    expect(document.querySelector(".home-launcher__prompt")?.textContent).toMatch(/\?$/);
  });

  it("asks a different question, empties the field and takes focus again on each return", async () => {
    const user = userEvent.setup();
    const { lifecycle, field } = renderLauncher();
    const prompt = () => document.querySelector(".home-launcher__prompt")?.textContent;
    const first = prompt();
    await user.type(field, "tfg");
    field.blur();

    act(() => lifecycle.transition("hidden"));
    act(() => lifecycle.transition("active"));

    expect(prompt()).not.toBe(first);
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
  });

  it("leads with the newest project as Continue, which Enter in the empty field opens", async () => {
    const user = userEvent.setup();
    const { props, field } = renderLauncher();
    expect(field).toHaveFocus();
    expect(screen.getByRole("button", { name: "portfolio-web" })).toHaveClass("home-launcher__continue");
    // Continue is not listed a second time underneath.
    expect(screen.getAllByRole("button", { name: "portfolio-web" })).toHaveLength(1);

    await user.keyboard("{Enter}");
    expect(props.onOpenRecentProject).toHaveBeenCalledWith("C:\\dev\\portfolio-web");
  });

  it("offers no Continue while projects are already open", () => {
    renderLauncher({ hasOpenProjects: true });
    expect(document.querySelector(".home-launcher__continue")).toBeNull();
    expect(screen.getByRole("button", { name: "portfolio-web" })).toBeInTheDocument();
  });

  it("lists only favourites in the Favorites tab", async () => {
    const user = userEvent.setup();
    renderLauncher();
    const tabs = screen.getByRole("group", { name: "Show" });
    await user.click(within(tabs).getByRole("button", { name: "Favorites" }));
    expect(screen.getByRole("button", { name: "gitodile" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "tfg-robotica" })).not.toBeInTheDocument();
  });

  it("filters while typing, opens the first match with Enter, and offers to create one by that name", async () => {
    const user = userEvent.setup();
    const { props, field } = renderLauncher();
    await user.type(field, "tfg");

    expect(screen.queryByRole("group", { name: "Show" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "tfg-robotica" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "gitodile" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create a project called “tfg”" }));
    expect(props.onCreateNamedProject).toHaveBeenCalledWith("tfg");
    expect(field).toHaveValue("");

    await user.type(field, "tfg{Enter}");
    expect(props.onOpenRecentProject).toHaveBeenCalledWith("D:\\uni\\tfg-robotica");
  });

  it("turns a pasted address into Clone, filled in, and flags a project with the same name", async () => {
    const user = userEvent.setup();
    const { props, field } = renderLauncher();
    await user.click(field);
    await user.paste("https://github.com/luis/pixel-dungeon.git");

    expect(screen.getByRole("button", { name: "Clone pixel-dungeon to this computer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pixel-dungeon" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(props.onCloneFromUrl).toHaveBeenCalledWith("https://github.com/luis/pixel-dungeon.git");
  });

  it("opens a typed absolute path through the normal open", async () => {
    const user = userEvent.setup();
    const { props, field } = renderLauncher();
    await user.click(field);
    await user.paste("E:\\projects\\new-app");
    await user.click(screen.getByRole("button", { name: "Open this folder" }));
    expect(props.onOpenRecentProject).toHaveBeenCalledWith("E:\\projects\\new-app");
  });

  it("walks the results with the arrow keys and clears the query with Escape", async () => {
    const user = userEvent.setup();
    const { field } = renderLauncher();
    await user.type(field, "o");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveAttribute("data-launcher-item");
    await user.keyboard("{Escape}");
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
  });

  it("asks to paste something when there are no recent projects yet", () => {
    const { field } = renderLauncher({ recentProjects: [] });
    expect(field).toHaveAttribute("placeholder", "Paste a project's URL or a folder path…");
    expect(document.querySelector(".home-launcher__results")).toBeNull();
  });

  it("walks a first run through setting the computer up, in the space recents will take", async () => {
    const user = userEvent.setup();
    const onConfigureIdentity = vi.fn();
    renderLauncher({
      recentProjects: [],
      setup: { ...readySetup, identity: { name: "", email: "" }, accounts: [] },
      onConfigureIdentity,
    });

    const steps = screen.getByRole("region", { name: "Set up GitOdile" });
    expect(within(steps).getByText("1 of 3")).toBeInTheDocument();
    expect(within(steps).getByText("Git 2.50 is installed")).toBeInTheDocument();
    // No status line beside the steps: it would say the same things twice.
    expect(screen.queryByRole("group", { name: "This computer" })).not.toBeInTheDocument();

    await user.click(within(steps).getByRole("button", { name: "Set up" }));
    expect(onConfigureIdentity).toHaveBeenCalled();

    await user.click(within(steps).getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("region", { name: "Set up GitOdile" })).not.toBeInTheDocument();
    expect(localStorage.getItem("gitodile-home-setup-hidden")).toBe("true");
  });

  it("says what the computer is set up with at the card's foot, without the email", async () => {
    const user = userEvent.setup();
    const onOpenAccountSettings = vi.fn();
    renderLauncher({ setup: readySetup, onOpenAccountSettings });

    const status = screen.getByRole("group", { name: "This computer" });
    expect(within(status).getByRole("button", { name: "Git 2.50" })).toBeInTheDocument();
    // The name alone is shown; the sentence is its accessible name and tooltip.
    expect(within(status).getByRole("button", { name: "Saving as Luis Muñoz" })).toHaveTextContent(/^Luis Muñoz$/);
    expect(within(status).getByRole("button", { name: "Connect another account" })).toBeInTheDocument();
    expect(status.textContent).not.toContain("luis@example.com");

    await user.click(within(status).getByRole("button", { name: "GitHub account luis-m" }));
    expect(onOpenAccountSettings).toHaveBeenCalledWith("github");
  });

  it("flags a missing name or email in the status line", () => {
    renderLauncher({ setup: { ...readySetup, identity: { name: "Luis", email: "" } } });
    expect(screen.getByRole("button", { name: "Add your name and email" })).toBeInTheDocument();
  });

  it("puts a missing Git above everything it would break", async () => {
    const user = userEvent.setup();
    const onRecheckGit = vi.fn();
    const onInstallGit = vi.fn();
    const { props } = renderLauncher({
      setup: { ...readySetup, git: { state: "missing", version: null, isRechecking: false } },
      onRecheckGit,
      onInstallGit,
    });

    expect(screen.getByText("GitOdile needs Git to work")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open a project" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "portfolio-web" })).toBeDisabled();
    expect(document.querySelector(".home-launcher__go--quiet")).not.toBeNull();
    // The status line no longer repeats Git.
    expect(screen.queryByRole("button", { name: /^Git / })).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(props.onOpenRecentProject).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Install Git" }));
    expect(onInstallGit).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(onRecheckGit).toHaveBeenCalled();
  });

  it("lists an account's projects only once its tab is chosen, and clones through the dialog", async () => {
    const user = userEvent.setup();
    const port: RepositoryBrowserPort = {
      list: vi.fn(async (accountId: string, page: number) => ({
        accountId,
        page,
        nextPage: null,
        repositories: [
          { id: 1, name: "portfolio-web", fullName: "luis-m/portfolio-web", owner: "luis-m", private: true, archived: false, description: null, cloneUrl: "https://github.com/luis-m/portfolio-web.git" },
          { id: 2, name: "pixel-dungeon", fullName: "luis-m/pixel-dungeon", owner: "luis-m", private: false, archived: false, description: null, cloneUrl: "https://github.com/luis-m/pixel-dungeon.git" },
        ],
      })),
      cancel: vi.fn(async () => {}),
    };
    const repositoryBrowser = createRepositoryBrowserController(port);
    const { props, field } = renderLauncher({ setup: readySetup, repositoryBrowser });
    expect(port.list).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "GitHub" }));
    expect(port.list).toHaveBeenCalledWith("github:luis-m", 1, expect.any(String));
    expect(await screen.findByRole("button", { name: "luis-m/portfolio-web" })).toBeInTheDocument();
    expect(field).toHaveAttribute("placeholder", "Search your GitHub projects…");

    await user.type(field, "pixel");
    expect(screen.queryByRole("button", { name: "luis-m/portfolio-web" })).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(props.onCloneFromUrl).toHaveBeenCalledWith("https://github.com/luis-m/pixel-dungeon.git");
  });

  it("shows an account and a token on one provider as one status entry and one tab with a chooser", async () => {
    const user = userEvent.setup();
    const port: RepositoryBrowserPort = {
      list: vi.fn(async (accountId: string, page: number) => ({
        accountId,
        page,
        nextPage: null,
        repositories: [
          {
            id: accountId === "github:luis-m" ? 1 : 2,
            name: "repo",
            fullName: accountId === "github:luis-m" ? "luis-m/repo" : "luis-bot/repo",
            owner: "x",
            private: false,
            archived: false,
            description: null,
            cloneUrl: "https://github.com/x/repo.git",
          },
        ],
      })),
      cancel: vi.fn(async () => {}),
    };
    renderLauncher({
      setup: {
        ...readySetup,
        accounts: [
          { id: "github:luis-m", kind: "github", login: "luis-m", source: "connection", server: null },
          { id: "github:luis-bot", kind: "github", login: "luis-bot", source: "connection", server: null },
        ],
      },
      repositoryBrowser: createRepositoryBrowserController(port),
    });

    // With a GitHub tab above, the status line does not list GitHub again.
    const status = screen.getByRole("group", { name: "This computer" });
    expect(within(status).queryByRole("button", { name: /GitHub/ })).not.toBeInTheDocument();
    expect(within(status).getByRole("button", { name: "Connect another account" })).toBeInTheDocument();

    const tabs = screen.getByRole("group", { name: "Show" });
    expect(within(tabs).getAllByRole("button", { name: "GitHub" })).toHaveLength(1);
    await user.click(within(tabs).getByRole("button", { name: "GitHub" }));
    expect(await screen.findByRole("button", { name: "luis-m/repo" })).toBeInTheDocument();

    const chooser = screen.getByRole("group", { name: "GitHub account" });
    await user.click(within(chooser).getByRole("button", { name: "luis-bot" }));
    expect(port.list).toHaveBeenLastCalledWith("github:luis-bot", 1, expect.any(String));
    expect(await screen.findByRole("button", { name: "luis-bot/repo" })).toBeInTheDocument();
  });

  it("tells an account and a token with the same login apart, and turns three or more into a menu", async () => {
    const user = userEvent.setup();
    const port: RepositoryBrowserPort = {
      list: vi.fn(async (accountId: string, page: number) => ({ accountId, page, nextPage: null, repositories: [] })),
      cancel: vi.fn(async () => {}),
    };
    const connection = { id: "gitlab:cli.1", kind: "gitlab" as const, login: "martinezelx", source: "connection" as const, server: null };
    const token = { id: "gitlab:token.1", kind: "gitlab" as const, login: "martinezelx", source: "token" as const, server: null };
    renderLauncher({ setup: { ...readySetup, accounts: [connection, token] }, repositoryBrowser: createRepositoryBrowserController(port) });
    await user.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "GitLab" }));
    const pair = screen.getByRole("group", { name: "GitLab account" });
    expect(within(pair).getByRole("button", { name: "martinezelx · Account" })).toHaveAttribute("aria-pressed", "true");
    expect(within(pair).getByRole("button", { name: "martinezelx · Token" })).toBeInTheDocument();
    // The heading leaves the login to the chooser.
    expect(screen.getByRole("heading", { name: "Your projects on GitLab" })).toBeInTheDocument();
    cleanup();

    const company = { id: "gitlab-acme:token.2", kind: "gitlab" as const, login: "luis", source: "token" as const, server: "git.acme.dev" };
    renderLauncher({ setup: { ...readySetup, accounts: [connection, token, company] }, repositoryBrowser: createRepositoryBrowserController(port) });
    await user.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "GitLab" }));
    const menu = screen.getByRole("combobox", { name: "GitLab account" });
    expect(within(menu).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "martinezelx · Account",
      "martinezelx · Token",
      "luis · Token · git.acme.dev",
    ]);
    await user.selectOptions(menu, "gitlab-acme:token.2");
    expect(port.list).toHaveBeenLastCalledWith("gitlab-acme:token.2", 1, expect.any(String));
  });

  it("holds the places of entries still being read instead of saying there are none", () => {
    const port: RepositoryBrowserPort = { list: vi.fn(), cancel: vi.fn(async () => {}) };
    renderLauncher({
      setup: { git: { state: "checking", version: null, isRechecking: false }, identity: null, accounts: null },
      repositoryBrowser: createRepositoryBrowserController(port),
    });

    // A tab is coming: the row is there with a placeholder in it.
    const tabs = screen.getByRole("group", { name: "Show" });
    expect(tabs.querySelector(".home-launcher__tab--placeholder")).not.toBeNull();
    // The status line keeps three places and invites nothing yet.
    const status = screen.getByRole("group", { name: "This computer" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status.querySelectorAll(".home-status__item--placeholder")).toHaveLength(3);
    expect(within(status).queryByRole("button", { name: "Connect an account" })).not.toBeInTheDocument();
  });

  it("names Git by its mark, with the short version and no check", () => {
    renderLauncher({ setup: { ...readySetup, git: { state: "available", version: "2.55.0.windows.3", isRechecking: false } } });
    const git = within(screen.getByRole("group", { name: "This computer" })).getByRole("button", { name: "Git 2.55" });
    expect(git).toHaveTextContent(/^2\.55$/);
    expect(git).toHaveAttribute("data-tooltip", "Git 2.55.0.windows.3");
    expect(git.querySelector(".home-status__ok")).toBeNull();
  });

  it("holds one place per provider still being checked, beside the ones already in", () => {
    const port: RepositoryBrowserPort = { list: vi.fn(), cancel: vi.fn(async () => {}) };
    renderLauncher({
      setup: {
        ...readySetup,
        // GitHub's check landed; GitLab's is still running.
        accounts: [{ id: "github:luis-m", kind: "github", login: "luis-m", source: "connection", server: null }],
        pendingAccountKinds: ["gitlab"],
      },
      repositoryBrowser: createRepositoryBrowserController(port),
    });

    const tabs = screen.getByRole("group", { name: "Show" });
    expect(within(tabs).getByRole("button", { name: "GitHub" })).toBeInTheDocument();
    expect(tabs.querySelectorAll(".home-launcher__tab--placeholder")).toHaveLength(1);
    // The "+" waits for the check rather than appear and move.
    const status = screen.getByRole("group", { name: "This computer" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(within(status).queryByRole("button", { name: "Connect another account" })).not.toBeInTheDocument();
  });

  it("holds two places when both providers are still being checked", () => {
    const port: RepositoryBrowserPort = { list: vi.fn(), cancel: vi.fn(async () => {}) };
    renderLauncher({
      setup: { ...readySetup, accounts: [], pendingAccountKinds: ["github", "gitlab"] },
      repositoryBrowser: createRepositoryBrowserController(port),
    });
    const tabs = screen.getByRole("group", { name: "Show" });
    expect(tabs.querySelectorAll(".home-launcher__tab--placeholder")).toHaveLength(2);
  });

  it("draws the favourite Enter opens as the selected row", async () => {
    const user = userEvent.setup();
    const { props } = renderLauncher();
    await user.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "Favorites" }));
    expect(screen.getByRole("button", { name: "gitodile" }).closest("li")).toHaveClass("home-launcher__item--primary");
    await user.click(screen.getByRole("textbox", { name: "Find a project, or paste a path or URL" }));
    await user.keyboard("{Enter}");
    expect(props.onOpenRecentProject).toHaveBeenCalledWith("C:\\workspace\\gitodile");
  });

  it("only gives recent-project rows the floating star and Remove", async () => {
    const user = userEvent.setup();
    const port: RepositoryBrowserPort = {
      list: vi.fn(async (accountId: string, page: number) => ({
        accountId,
        page,
        nextPage: null,
        repositories: [
          { id: 1, name: "a", fullName: "luis-m/a", owner: "luis-m", private: false, archived: false, description: null, cloneUrl: "https://github.com/luis-m/a.git" },
        ],
      })),
      cancel: vi.fn(async () => {}),
    };
    renderLauncher({ setup: readySetup, repositoryBrowser: createRepositoryBrowserController(port) });
    expect(screen.getAllByRole("button", { name: "tfg-robotica" })[0].closest("li")).toHaveClass("home-launcher__item--recent");
    await user.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "GitHub" }));
    const repo = await screen.findByRole("button", { name: "luis-m/a" });
    expect(repo.closest("li")).not.toHaveClass("home-launcher__item--recent");
  });

  it("loads the account a tab falls back to when its chosen one is removed", async () => {
    const user = userEvent.setup();
    const port: RepositoryBrowserPort = {
      list: vi.fn(async (accountId: string, page: number) => ({ accountId, page, nextPage: null, repositories: [] })),
      cancel: vi.fn(async () => {}),
    };
    const repositoryBrowser = createRepositoryBrowserController(port);
    const first = { id: "gitlab:cli.1", kind: "gitlab" as const, login: "luis", source: "connection" as const, server: null };
    const second = { id: "gitlab:token.2", kind: "gitlab" as const, login: "bot", source: "token" as const, server: null };
    const base = {
      isOpening: false,
      recentProjects: recents,
      onOpenProject: vi.fn(),
      onCreateProject: vi.fn(),
      onCloneProject: vi.fn(),
      onOpenRecentProject: vi.fn(),
      onToggleFavouriteRecentProject: vi.fn(),
      onForgetRecentProject: vi.fn(),
      playGreeting: false,
      repositoryBrowser,
    };
    const lifecycle = createScreenLifecycleController("active");
    const view = (accounts: HomeAccount[]) => (
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HomeLauncher {...base} setup={{ ...readySetup, accounts }} />
        </ScreenLifecycleProvider>
      </LanguageProvider>
    );
    const { rerender } = render(view([first, second]));
    await user.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "GitLab" }));
    await user.click(within(screen.getByRole("group", { name: "GitLab account" })).getByRole("button", { name: "bot · Token" }));
    expect(port.list).toHaveBeenLastCalledWith("gitlab:token.2", 1, expect.any(String));

    // The token is removed in Settings: the browser follows the tab to the
    // account that is left (its page was already read, so it comes from cache).
    rerender(view([first]));
    expect(repositoryBrowser.snapshot().accountId).toBe("gitlab:cli.1");
    expect(repositoryBrowser.snapshot().page?.accountId).toBe("gitlab:cli.1");
  });
});
