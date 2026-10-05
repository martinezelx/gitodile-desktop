import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { RepositoryBrowser } from "./RepositoryBrowser";
import { createRepositoryBrowserController } from "./controller";
import type { AccountCatalog } from "../accounts";

const resizeObserver = globalThis.ResizeObserver;
beforeEach(() => {
  globalThis.ResizeObserver = class implements ResizeObserver { observe() {} unobserve() {} disconnect() {} };
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("repository-browser__list") ? 280 : 76; });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); globalThis.ResizeObserver = resizeObserver; localStorage.clear(); });
const catalog: AccountCatalog = { providers: [{ id: "github", host: "github.com" }], busy: false,
  accounts: [{ id: "github:token.octocat", provider: "github", host: "github.com", login: "octocat", avatarDataUrl: null, available: true }] };
const projects = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `project-${index}`, fullName: `team/project-${index}`, owner: "team",
  private: true, archived: false, description: null, cloneUrl: `https://github.com/team/project-${index}.git` }));
it("keeps keyboard entry when a refresh removes the previously focused row", async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValueOnce({ accountId: "github:token.octocat", page: 1, repositories: projects(6), nextPage: null })
    .mockResolvedValueOnce({ accountId: "github:token.octocat", page: 1, repositories: projects(1), nextPage: null });
  const controller = createRepositoryBrowserController({ list, cancel: vi.fn(async () => undefined) });
  const choose = vi.fn();
  render(<LanguageProvider><RepositoryBrowser controller={controller} catalog={catalog} checking={false} failed={false} onCheck={vi.fn()} onChoose={choose} /></LanguageProvider>);
  await user.click(screen.getByRole("combobox"));
  await user.click(screen.getByRole("option", { name: /@octocat/ }));
  await user.click(screen.getByRole("button", { name: "Find projects" }));
  await user.click(await screen.findByRole("button", { name: "Choose team/project-5" }));
  await user.click(screen.getByRole("button", { name: "Refresh projects" }));
  await screen.findByText("Page 1 · 1 projects");
  await user.tab();
  expect(screen.getByRole("button", { name: "Choose team/project-0" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(choose.mock.calls.at(-1)?.[0].repository.name).toBe("project-0");
});
it("keeps a tabbable project when wheel scrolling virtualizes the active row away", async () => {
  const user = userEvent.setup();
  const list = vi.fn(async () => ({ accountId: "github:token.octocat", page: 1, repositories: projects(100), nextPage: null }));
  const controller = createRepositoryBrowserController({ list, cancel: vi.fn(async () => undefined) });
  render(<LanguageProvider><RepositoryBrowser controller={controller} catalog={catalog} checking={false} failed={false} onCheck={vi.fn()} onChoose={vi.fn()} /></LanguageProvider>);
  await user.click(screen.getByRole("combobox"));
  await user.click(screen.getByRole("option", { name: /@octocat/ }));
  await user.click(screen.getByRole("button", { name: "Find projects" }));
  const listElement = await screen.findByRole("list", { name: "Browse projects" });
  const viewport = listElement.parentElement!;
  viewport.scrollTop = 1500;
  fireEvent.scroll(viewport);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Choose team/project-0" })).not.toBeInTheDocument());
  await user.click(screen.getByRole("searchbox"));
  await user.tab();
  expect(screen.getByRole("button", { name: "Refresh projects" })).toHaveFocus();
  await user.tab();
  expect(listElement.contains(document.activeElement)).toBe(true);
  expect(document.activeElement?.tagName).toBe("BUTTON");
});
it("virtualizes a page, shows permissions/partial-search semantics, and hands off the exact token connection", async () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `project-${index}`, fullName: `team/project-${index}`, owner: "team",
    private: true, archived: index === 0, description: "A team project", cloneUrl: `https://github.com/team/project-${index}.git` }));
  const list = vi.fn(async (accountId: string, page: number) => ({ accountId, page, repositories: page === 1 ? rows : [], nextPage: page === 1 ? 2 : null }));
  const controller = createRepositoryBrowserController({ list, cancel: vi.fn(async () => undefined) });
  const choose = vi.fn();
  render(<LanguageProvider><RepositoryBrowser controller={controller} catalog={catalog} checking={false} failed={false} onCheck={vi.fn()} onChoose={choose} /></LanguageProvider>);
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(screen.getByRole("option", { name: /@octocat/ }));
  expect(list).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Find projects" }));
  expect(await screen.findByText("Page 1 · 100 projects")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem").length).toBeLessThan(20);
  const search = screen.getByRole("searchbox", { name: "Filter this page" });
  expect(within(search.parentElement!.parentElement!).getByRole("button", { name: "Refresh projects" })).toBeInTheDocument();
  expect(screen.queryByText(/Shows personal and team projects/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Choose team/project-0" }));
  expect(choose).toHaveBeenCalledWith({ repository: rows[0], accountId: "github:token.octocat" });
  await userEvent.type(screen.getByRole("searchbox"), "project-99");
  expect(await screen.findByRole("button", { name: "Choose team/project-99" })).toBeInTheDocument();
  expect(list).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(await screen.findByText("Page 2 · 0 projects")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Refresh projects" }));
  expect(list.mock.calls.at(-1)?.slice(0, 2)).toEqual(["github:token.octocat", 2]);
});

it("cancels from the search toolbar, ignores a late page and allows an explicit retry", async () => {
  const user = userEvent.setup();
  let finish!: (page: { accountId: string; page: number; repositories: []; nextPage: null }) => void;
  const list = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ accountId: "github:token.octocat", page: 1, repositories: [], nextPage: null });
  const cancel = vi.fn(async () => undefined);
  const controller = createRepositoryBrowserController({ list, cancel });
  render(<LanguageProvider><RepositoryBrowser controller={controller} catalog={catalog} checking={false} failed={false} onCheck={vi.fn()} onChoose={vi.fn()} /></LanguageProvider>);
  expect(screen.getByRole("button", { name: "Find projects" })).toBeDisabled();
  await user.click(screen.getByRole("combobox"));
  await user.click(screen.getByRole("option", { name: /@octocat/ }));
  expect(list).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Find projects" }));
  expect(screen.getByRole("button", { name: "Finding projects…" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledWith(list.mock.calls[0][2]);
  await act(async () => { finish({ accountId: "github:token.octocat", page: 1, repositories: [], nextPage: null }); });
  expect(screen.queryByText("Page 1 · 0 projects")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Find projects" }));
  expect(await screen.findByText("Page 1 · 0 projects")).toBeInTheDocument();
  expect(screen.getByText(/No projects on this page/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
});
