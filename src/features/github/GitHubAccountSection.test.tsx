import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { EMPTY_GITHUB_AUTH, GITHUB_DEVICE_URL } from "./domain";
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

describe("GitHub account Settings body", () => {
  it("discloses shared access, repository permission and plaintext fallback before login, with keyboard focus", async () => {
    const c = controller(); show(c);
    await userEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));
    expect(c.connect).not.toHaveBeenCalled();
    expect(screen.getByText(/shared with GitHub CLI/)).toBeInTheDocument();
    expect(screen.getByText(/private repositories/)).toBeInTheDocument();
    expect(screen.getByText(/plain-text file/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in browser" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(c.connect).toHaveBeenCalledTimes(1);
  });

  it("leaves the session untouched when consent is dismissed", async () => {
    const c = controller(); show(c);
    await userEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(c.connect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toHaveFocus();
  });

  it("disables account actions until the tool is available", () => {
    const c = controller(); show(c, false);
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Detect GitHub CLI account" })).toBeDisabled();
    expect(c.check).not.toHaveBeenCalled();
  });

  it("shows a known identity during offline checks and warns about shared plaintext storage", () => {
    show(controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "offline", account: { login: "octocat", host: "github.com", storage: "file", avatarDataUrl: null } } }));
    expect(screen.getByText("@octocat")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't reach GitHub");
    expect(screen.getByText(/plain-text file/)).toBeInTheDocument();
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

  it.each(["cli_unsupported", "environment_controlled"] as const)("blocks login for %s", (state) => {
    show(controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state } }));
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check connection" })).toBeEnabled();
  });

  it("localizes the account flow in Spanish", async () => {
    localStorage.setItem("gitodile-language", "es");
    show(controller());
    await userEvent.click(screen.getByRole("button", { name: "Conectar GitHub" }));
    expect(screen.getByText(/texto plano/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar en el navegador" })).toBeInTheDocument();
  });

  it("renders only cached image data and falls back when the avatar fails", () => {
    const account = { login: "octocat", host: "github.com" as const, storage: "secure" as const, avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" };
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

  it("previews shared-session logout and sends the exact account only after confirmation", async () => {
    const c = controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "connected", account: {
      login: "octocat", host: "github.com", storage: "secure", avatarDataUrl: null } } });
    show(c);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(c.disconnect).not.toHaveBeenCalled();
    expect(screen.getByText(/other tools that use its session/)).toBeInTheDocument();
    expect(screen.getByText(/browser session/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(c.disconnect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out @octocat" }));
    expect(c.disconnect).toHaveBeenCalledExactlyOnceWith("octocat");
  });

  it("blocks environment logout and offers a new connection after an account was removed", () => {
    const view = show(controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "connected", account: {
      login: "octocat", host: "github.com", storage: "environment", avatarDataUrl: null } } }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
    view.rerender(<LanguageProvider><GitHubAccountSection available controller={controller({ snapshot: {
      ...EMPTY_GITHUB_AUTH, state: "signed_out", signedOutAccount: "octocat" } })} /></LanguageProvider>);
    expect(screen.getByText(/@octocat was signed out/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("shows connected and saved accounts and submits the chosen account without opening login", async () => {
    const account = { login: "octocat", host: "github.com" as const, storage: "secure" as const, avatarDataUrl: null };
    const c = controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "connected", account,
      accounts: [{ ...account, active: true, state: "connected" }, { ...account, login: "studio", active: false, state: "connected" }] } });
    show(c);
    expect(within(screen.getByRole("group", { name: "@octocat" })).getByText("Connected", { selector: ".tool-row__chip span" })).toBeInTheDocument();
    const saved = within(screen.getByRole("group", { name: "@studio" }));
    expect(saved.getByText("Saved")).toBeInTheDocument();
    await userEvent.click(saved.getByRole("button", { name: "Use @studio" }));
    expect(c.activate).toHaveBeenCalledExactlyOnceWith("studio");
    expect(c.connect).not.toHaveBeenCalled();
    await userEvent.click(saved.getByRole("button", { name: "Sign out @studio" }));
    expect(c.disconnect).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(saved.getByRole("button", { name: "Sign out @studio" })).toHaveFocus();
    await userEvent.click(saved.getByRole("button", { name: "Sign out @studio" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Sign out @studio" }).at(-1)!);
    expect(c.disconnect).toHaveBeenCalledExactlyOnceWith("studio");
  });

  it("requires consent before adding another account and restores focus on dismissal", async () => {
    const account = { login: "octocat", host: "github.com" as const, storage: "secure" as const, avatarDataUrl: null };
    const c = controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "connected", account } }); show(c);
    await userEvent.click(screen.getByRole("button", { name: "Connect another account" }));
    expect(c.connect).not.toHaveBeenCalled();
    expect(screen.getByText(/private repositories/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Connect another account" })).toHaveFocus();
    expect(screen.queryByText(/private repositories/)).toBeNull();
  });

  it("keeps actionable keyboard focus on the selected account after switching", async () => {
    const first = { login: "octocat", host: "github.com" as const, storage: "secure" as const, avatarDataUrl: null };
    const second = { ...first, login: "studio" };
    const initial = { ...EMPTY_GITHUB_AUTH, state: "connected" as const, account: first,
      accounts: [{ ...first, active: true, state: "connected" as const }, { ...second, active: false, state: "connected" as const }] };
    const c = controller({ snapshot: initial });
    const view = show(c);
    await userEvent.click(screen.getByRole("button", { name: "Use @studio" }));
    view.rerender(<LanguageProvider><GitHubAccountSection available controller={controller({
      snapshot: { ...initial, state: "switching", operationId: "switch-1" } })} /></LanguageProvider>);
    view.rerender(<LanguageProvider><GitHubAccountSection available controller={controller({ snapshot: {
      ...initial, account: second, accounts: [{ ...second, active: true, state: "connected" }, { ...first, active: false, state: "connected" }],
    } })} /></LanguageProvider>);
    expect(within(screen.getByRole("group", { name: "@studio" })).getByRole("button", { name: "Sign out" })).toHaveFocus();
  });

  it("does not claim stale accounts are connected and keeps a check available after active-account removal", () => {
    const account = { login: "studio", host: "github.com" as const, storage: "secure" as const, avatarDataUrl: null };
    show(controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "offline", needsCheck: true,
      accounts: [{ ...account, active: false, state: "connected" }] } }));
    expect(screen.queryByText("Connected")).toBeNull();
    expect(screen.getByRole("button", { name: "Use @studio" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check connection" })).toBeEnabled();
  });

  it("blocks all stored-account mutations when an environment credential controls the active session", () => {
    const account = { login: "octocat", host: "github.com" as const, storage: "environment" as const, avatarDataUrl: null };
    show(controller({ snapshot: { ...EMPTY_GITHUB_AUTH, state: "connected", account,
      accounts: [{ ...account, active: true, state: "connected" }, { ...account, login: "studio", storage: "secure", active: false, state: "connected" }] } }));
    expect(screen.getByRole("button", { name: "Use @studio" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign out @studio" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Connect another account" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check connection" })).toBeEnabled();
  });
});
