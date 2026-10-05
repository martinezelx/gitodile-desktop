import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { GitHubTokenSection } from "./GitHubTokenSection";
import type { GitHubTokenPort } from "./tokenPort";
import type { AccountCatalog, AccountsPort } from "../accounts";

afterEach(() => { cleanup(); localStorage.clear(); });
const accountPort: AccountsPort = { readCatalog: async () => ({ providers: [], accounts: [], busy: false }),
  check: vi.fn(), readProject: vi.fn(), selectProject: vi.fn() };
function show(port: GitHubTokenPort) { return render(<LanguageProvider><GitHubTokenSection port={port} accountPort={accountPort} /></LanguageProvider>); }
describe("token connection settings", () => {
  it("recovers a committed token when its ingestion receipt is lost", async () => {
    let rows: AccountCatalog["accounts"] = [];
    const accounts: AccountsPort = { ...accountPort, readCatalog: async () => ({ providers: [{ id: "github", host: "github.com" }], accounts: rows, busy: false }) };
    const add = vi.fn(async () => {
      rows = [{ id: "github:token.octocat", provider: "github", host: "github.com", login: "octocat", avatarDataUrl: null, available: true }];
      throw new Error("Lost receipt");
    });
    render(<LanguageProvider><GitHubTokenSection port={{ add, remove: vi.fn(), cancel: vi.fn() }} accountPort={accounts} /></LanguageProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Add a token" }));
    await userEvent.type(screen.getByLabelText("Personal access token"), "fixture-secret-token-1234");
    await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    expect(await screen.findByRole("group", { name: "@octocat" })).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByLabelText("Personal access token")).toHaveValue("");
    expect(screen.queryByText("Token connection verified and saved.")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("fixture-secret");
  });
  it("reconciles a partially removed token instead of continuing to show connected", async () => {
    let rows: AccountCatalog["accounts"] = [{ id: "github:token.octocat", provider: "github", host: "github.com", login: "octocat", avatarDataUrl: null, available: true }];
    const accounts: AccountsPort = { ...accountPort, readCatalog: async () => ({ providers: [{ id: "github", host: "github.com" }], accounts: rows, busy: false }) };
    const remove = vi.fn(async () => {
      rows = [{ ...rows[0], available: false, unavailableReason: "authentication_failed" }];
      throw { code: "secure_storage_unavailable", message: "Safe failure" };
    });
    render(<LanguageProvider><GitHubTokenSection port={{ add: vi.fn(), remove, cancel: vi.fn() }} accountPort={accounts} /></LanguageProvider>);
    await userEvent.click(within(await screen.findByRole("group", { name: "@octocat" })).getByRole("button", { name: "Remove token connection" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Remove the token connection for @octocat?" })).getByRole("button", { name: "Remove token connection" }));
    expect(await within(screen.getByRole("group", { name: "@octocat" })).findByText(/Couldn't sign in to the remote/)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(/secure credential store is unavailable/);
    expect(screen.queryByText("Token connection removed from GitOdile.")).not.toBeInTheDocument();
  });
  it("keeps permissions optional, focuses the masked field, and restores the add button on dismissal", async () => {
    show({ add: vi.fn(), remove: vi.fn(), cancel: vi.fn() });
    expect(screen.getByText(/Works with or without GitHub CLI/)).toBeVisible();
    const add = screen.getByRole("button", { name: "Add a token" });
    await userEvent.click(add);
    expect(screen.getByLabelText("Personal access token")).toHaveFocus();
    expect(screen.getByLabelText("Personal access token")).toHaveAttribute("type", "password");
    const permissions = screen.getByText("Which permissions does my token need?").closest("details");
    expect(permissions).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("Which permissions does my token need?"));
    expect(permissions).toHaveAttribute("open");
    await userEvent.keyboard("{Escape}");
    expect(add).toHaveFocus();
    expect(screen.queryByLabelText("Personal access token")).toBeNull();
  });
  it("names the selected token in removal consent and restores focus without affecting another connection", async () => {
    let rows = ["work", "personal"].map(login => ({ id: `github:token.${login}`, provider: "github", host: "github.com", login, avatarDataUrl: null, available: true }));
    const accounts: AccountsPort = { ...accountPort, readCatalog: async () => ({ providers: [{ id: "github", host: "github.com" }], busy: false, accounts: rows }) };
    const remove = vi.fn(async (id: string) => { rows = rows.filter(row => row.id !== id); });
    render(<LanguageProvider><GitHubTokenSection port={{ add: vi.fn(), remove, cancel: vi.fn() }} accountPort={accounts} /></LanguageProvider>);
    const work = await screen.findByRole("group", { name: "@work" });
    const trigger = within(work).getByRole("button", { name: "Remove token connection" });
    await userEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus(); expect(remove).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    const consent = screen.getByRole("group", { name: "Remove the token connection for @work?" });
    await userEvent.click(within(consent).getByRole("button", { name: "Remove token connection" }));
    expect(remove).toHaveBeenCalledExactlyOnceWith("github:token.work");
    expect(await screen.findByText("Token connection removed from GitOdile.")).toBeVisible();
    expect(screen.getByRole("group", { name: "@personal" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "@work" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add a token" })).toHaveFocus();
  });
  it("explains a saved connection's failed secure-store verification without exposing diagnostics", async () => {
    const accounts: AccountsPort = { ...accountPort, readCatalog: async () => ({ providers: [{ id: "github", host: "github.com" }], busy: false,
      accounts: [{ id: "github:token.octocat", provider: "github", host: "github.com", login: "octocat", avatarDataUrl: null,
        available: false, unavailableReason: "secure_storage_unavailable" }] }) };
    render(<LanguageProvider><GitHubTokenSection port={{ add: vi.fn(), remove: vi.fn(), cancel: vi.fn() }} accountPort={accounts} /></LanguageProvider>);
    expect(await screen.findByText(/secure credential store is unavailable/)).toBeVisible();
    expect(screen.getByText(/@octocat/)).toBeVisible();
  });
  it("clears the input before native ingestion and never persists it in renderer storage", async () => {
    let finish!: (id: string) => void;
    const add = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    show({ add, remove: vi.fn(), cancel: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "Add a token" }));
    const input = screen.getByLabelText("Personal access token");
    await userEvent.type(input, "fixture-secret-token-1234");
    await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    expect(input).toHaveValue(""); expect(add).toHaveBeenCalledWith("fixture-secret-token-1234", expect.any(String));
    expect(JSON.stringify(localStorage)).not.toContain("fixture-secret");
    await act(async () => { finish("github:token.octocat"); });
    expect(await screen.findByText("Token connection verified and saved.")).toBeVisible();
    expect(screen.queryByLabelText("Personal access token")).toBeNull();
  });
  it("discards a dismissed draft and shows secure-store failures without echoing tokens", async () => {
    const add = vi.fn(async () => { throw { code: "secure_storage_unavailable", message: "safe" }; });
    show({ add, remove: vi.fn(), cancel: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "Add a token" }));
    await userEvent.type(screen.getByLabelText("Personal access token"), "fixture-secret-token-1234");
    await userEvent.keyboard("{Escape}"); expect(add).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Add a token" }));
    expect(screen.getByLabelText("Personal access token")).toHaveValue("");
    await userEvent.type(screen.getByLabelText("Personal access token"), "fixture-secret-token-5678");
    await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("secure credential store is unavailable");
    expect(document.body.textContent).not.toContain("fixture-secret");
  });
});
