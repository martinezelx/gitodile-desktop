import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { EMPTY_GITHUB_AUTH, GITHUB_DEVICE_URL, type GitHubAuthSnapshot } from "./domain";
import { GitHubAccountSection } from "./GitHubAccountSection";
import type { GitHubAuthController } from "./useGitHubAuth";

afterEach(() => { cleanup(); localStorage.clear(); });
function controller(overrides: Partial<GitHubAuthController> = {}): GitHubAuthController {
  return { snapshot: EMPTY_GITHUB_AUTH, pending: false, browserFailed: false, check: vi.fn(async () => undefined),
    connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined), activate: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), openBrowser: vi.fn(async () => undefined), ...overrides };
}
function show(c: GitHubAuthController, available = true) {
  return render(<LanguageProvider><GitHubAccountSection controller={c} available={available} /></LanguageProvider>);
}
const octocat = { login: "octocat", host: "github.com", storage: "secure" as const, avatarDataUrl: null };
function connected(...accounts: { login: string; active: boolean; storage?: "secure" | "file" | "environment" | "unknown" }[]): GitHubAuthSnapshot {
  const rows = accounts.map(({ login, active, storage = "secure" }) => ({ ...octocat, login, storage, active, state: "connected" as const }));
  const active = rows.find(row => row.active);
  return { ...EMPTY_GITHUB_AUTH, state: "connected", account: active ? { login: active.login, host: active.host, storage: active.storage, avatarDataUrl: null } : null, accounts: rows };
}

describe("GitHub accounts in the shared account list", () => {
  it("renders nothing while idle without accounts", () => {
    const view = show(controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "signed_out" } }));
    expect(view.container).toBeEmptyDOMElement();
  });

  it("gives each saved account one row with short text actions and no per-row check", async () => {
    const c = controller({ snapshot: connected({ login: "octocat", active: true }, { login: "studio", active: false }) });
    show(c);
    expect(within(screen.getByRole("group", { name: "@octocat" })).getByText("Connected")).toBeInTheDocument();
    const saved = within(screen.getByRole("group", { name: "@studio" }));
    expect(saved.getByText("Saved")).toBeInTheDocument();
    expect(saved.getByText("Browser")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check/ })).toBeNull();
    await userEvent.click(saved.getByRole("button", { name: "Use @studio" }));
    expect(c.activate).toHaveBeenCalledExactlyOnceWith("studio");
    expect(c.connect).not.toHaveBeenCalled();
  });

  it("does not offer switching gh's active account where the list forbids it", () => {
    render(<LanguageProvider><GitHubAccountSection controller={controller({ snapshot: connected({ login: "octocat", active: true }, { login: "studio", active: false }) })}
      available allowSwitch={false} /></LanguageProvider>);
    expect(screen.queryByRole("button", { name: "Use @studio" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out @studio" })).toBeEnabled();
  });

  it("previews shared-session logout and sends the exact account only after confirmation", async () => {
    const c = controller({ snapshot: connected({ login: "octocat", active: true }) });
    show(c);
    const trigger = screen.getByRole("button", { name: "Sign out @octocat" });
    expect(trigger).toHaveTextContent("Sign out");
    await userEvent.click(trigger);
    expect(c.disconnect).not.toHaveBeenCalled();
    expect(screen.getByText(/for every tool that uses it/)).toBeInTheDocument();
    expect(screen.getByText(/browser session/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(c.disconnect).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(screen.getAllByRole("button", { name: "Sign out @octocat" }).at(-1)!);
    expect(c.disconnect).toHaveBeenCalledExactlyOnceWith("octocat");
  });

  it("asks for consent before reconnecting an invalid account", async () => {
    const snapshot = { ...connected({ login: "octocat", active: true }), state: "invalid" as const };
    snapshot.accounts = snapshot.accounts.map(row => ({ ...row, state: "invalid" as const }));
    const c = controller({ snapshot });
    show(c);
    expect(screen.getByText(/no longer valid/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reconnect GitHub" }));
    expect(c.connect).not.toHaveBeenCalled();
    expect(screen.getByText(/private repositories/)).toBeInTheDocument();
    expect(screen.getByText(/plain-text file/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in browser" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(c.connect).toHaveBeenCalledOnce();
  });

  it("keeps a known identity visible offline and warns about plain-text storage", () => {
    show(controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "offline", account: { ...octocat, storage: "file" } } }));
    const row = within(screen.getByRole("group", { name: "@octocat" }));
    expect(row.queryByText("Connected")).toBeNull();
    expect(row.getByText(/Couldn't reach GitHub/)).toBeInTheDocument();
    expect(row.getByText(/plain-text file/)).toBeInTheDocument();
  });

  it("offers code copying, browser retry and cancellation while authorization is pending", async () => {
    const c = controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "awaiting_browser", operationId: "github-auth-1",
      deviceCode: "ABCD-1234", verificationUrl: GITHUB_DEVICE_URL }, browserFailed: true });
    show(c);
    expect(screen.getByText("ABCD-1234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't open the browser");
    await userEvent.click(screen.getByRole("button", { name: "Open GitHub" }));
    expect(c.openBrowser).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Cancel connection" }));
    expect(c.cancel).toHaveBeenCalledTimes(1);
  });

  it("localizes the rows and confirmations in Spanish", async () => {
    localStorage.setItem("gitodile-language", "es");
    show(controller({ snapshot: connected({ login: "octocat", active: true }) }));
    expect(screen.getByText("Conectada")).toBeInTheDocument();
    expect(screen.getByText("Navegador")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión de @octocat" }));
    expect(screen.getByText(/todas las herramientas que la usan/)).toBeInTheDocument();
  });

  it("renders only cached image data and falls back when the avatar fails", () => {
    const account = { ...octocat, avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" };
    const view = show(controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "connected", account } }));
    const image = view.container.querySelector("img")!;
    expect(image).toHaveAttribute("src", account.avatarDataUrl);
    expect(image).toHaveAttribute("alt", "");
    fireEvent.error(image);
    expect(view.container.querySelector("img")).toBeNull();
    view.rerender(<LanguageProvider><GitHubAccountSection available controller={controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "connected",
      account: { ...account, avatarDataUrl: "https://evil.example/avatar.svg" } } })} /></LanguageProvider>);
    expect(view.container.querySelector("img")).toBeNull();
    expect(screen.getByText("@octocat")).toBeInTheDocument();
  });

  it("blocks environment logout and reports an account that was signed out", () => {
    const view = show(controller({ snapshot: connected({ login: "octocat", active: true, storage: "environment" }) }));
    expect(screen.getByRole("button", { name: "Sign out @octocat" })).toBeDisabled();
    expect(screen.getByText(/environment variable/)).toBeInTheDocument();
    view.rerender(<LanguageProvider><GitHubAccountSection available controller={controller({ snapshot: {
      ...EMPTY_GITHUB_AUTH, state: "signed_out", signedOutAccount: "octocat" } })} /></LanguageProvider>);
    expect(screen.getByText(/@octocat was signed out/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign out/ })).toBeNull();
  });

  it("keeps actionable keyboard focus on the selected account after switching", async () => {
    const initial = connected({ login: "octocat", active: true }, { login: "studio", active: false });
    const view = show(controller({ snapshot: initial }));
    await userEvent.click(screen.getByRole("button", { name: "Use @studio" }));
    view.rerender(<LanguageProvider><GitHubAccountSection available controller={controller({
      snapshot: { ...initial, state: "switching", operationId: "switch-1" } })} /></LanguageProvider>);
    view.rerender(<LanguageProvider><GitHubAccountSection available controller={controller({
      snapshot: connected({ login: "studio", active: true }, { login: "octocat", active: false }) })} /></LanguageProvider>);
    expect(within(screen.getByRole("group", { name: "@studio" })).getByRole("button", { name: "Sign out @studio" })).toHaveFocus();
  });

  it("does not claim stale accounts are connected and disables actions until checked", () => {
    show(controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "offline", needsCheck: true,
      accounts: [{ ...octocat, login: "studio", active: false, state: "connected" }] } }));
    expect(screen.queryByText("Connected")).toBeNull();
    expect(screen.getByRole("button", { name: "Use @studio" })).toBeDisabled();
    expect(screen.getByText(/Check the accounts before trying again/)).toBeInTheDocument();
  });

  it("blocks all stored-account mutations when an environment credential controls the active session", () => {
    show(controller({ snapshot: connected({ login: "octocat", active: true, storage: "environment" }, { login: "studio", active: false }) }));
    expect(screen.getByRole("button", { name: "Use @studio" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign out @studio" })).toBeDisabled();
  });

  it("disables sign-out while GitHub CLI is unavailable", () => {
    show(controller({ snapshot: connected({ login: "octocat", active: true }) }), false);
    expect(screen.getByRole("button", { name: "Sign out @octocat" })).toBeDisabled();
  });
});
