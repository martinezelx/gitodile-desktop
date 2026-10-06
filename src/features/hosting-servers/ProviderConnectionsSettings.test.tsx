import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import type { AccountCatalog, AccountsPort, TokenConnectionPort } from "../accounts";
import { EMPTY_GITHUB_AUTH, type GitHubAuthController } from "../github";
import { ProviderConnectionsSettings } from "./ProviderConnectionsSettings";
import type { HostingServersPort } from "./port";

afterEach(() => { cleanup(); localStorage.clear(); });

const github = { id: "github", host: "github.com", kind: "github" as const, builtIn: true };
const server = { id: "ghe-0123456789", host: "ghe.example.com:8443", kind: "github" as const, builtIn: false };
type Row = AccountCatalog["accounts"][number];
const token = (provider: string, login: string, extra: Partial<Row> = {}): Row =>
  ({ id: `${provider}:token.${login}`, provider, host: provider === "github" ? "github.com" : server.host, login, avatarDataUrl: null, available: true, ...extra });

function controller(): GitHubAuthController {
  return { snapshot: { ...EMPTY_GITHUB_AUTH, state: "signed_out" }, pending: false, browserFailed: false,
    check: vi.fn(async () => undefined), connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined),
    activate: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), openBrowser: vi.fn(async () => undefined) };
}

function setup({ rows = [] as Row[], providers = [github] as AccountCatalog["providers"], tokenPort, cliAvailable = true }: {
  rows?: Row[]; providers?: AccountCatalog["providers"]; tokenPort?: Partial<TokenConnectionPort>; cliAvailable?: boolean;
} = {}) {
  const state = { rows, providers };
  const accountPort: AccountsPort = {
    readCatalog: vi.fn(async () => ({ providers: state.providers, accounts: state.rows, busy: false })),
    check: vi.fn(async () => ({ providers: state.providers, accounts: state.rows, busy: false })), readProject: vi.fn(), selectProject: vi.fn(),
  };
  const builtIn: TokenConnectionPort = { add: vi.fn(async () => "github:token.x"), remove: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), ...tokenPort };
  const serverToken: TokenConnectionPort = { add: vi.fn(async () => `${server.id}:token.x`), remove: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) };
  const serverAuth = { readState: vi.fn(async () => ({ ...EMPTY_GITHUB_AUTH, state: "signed_out" as const })), check: vi.fn(async () => EMPTY_GITHUB_AUTH),
    login: vi.fn(async () => EMPTY_GITHUB_AUTH), logout: vi.fn(), switchAccount: vi.fn(), cancel: vi.fn(), openBrowser: vi.fn() };
  const port: HostingServersPort = {
    add: vi.fn(async () => { state.providers = [...state.providers, server]; return { providers: state.providers, accounts: state.rows, busy: false }; }),
    remove: vi.fn(async () => { state.providers = state.providers.filter(p => p.id !== server.id); return { providers: state.providers, accounts: state.rows, busy: false }; }),
    cancel: vi.fn(async () => undefined),
    tokenPort: vi.fn(() => serverToken),
    githubAuthPort: vi.fn(() => serverAuth),
    gitlabAuthPort: vi.fn(),
  };
  const auth = controller();
  render(<LanguageProvider><ProviderConnectionsSettings auth={{ kind: "github", controller: auth }} cliAvailable={cliAvailable}
    port={port} accountPort={accountPort} tokenPort={builtIn} /></LanguageProvider>);
  return { state, accountPort, builtIn, serverToken, serverAuth, port, auth };
}

describe("one account list per product", () => {
  it("groups every host's connections under their own host", async () => {
    const { serverAuth } = setup({ providers: [github, server], rows: [token(server.id, "saml_user")] });
    const company = await screen.findByRole("group", { name: "ghe.example.com:8443" });
    const publicHost = screen.getByRole("group", { name: "github.com" });
    expect(within(publicHost).getByText("No accounts yet.")).toBeVisible();
    expect(within(company).getByRole("group", { name: "@saml_user" })).toBeVisible();
    expect(within(company).getByText("Company")).toBeVisible();
    // Showing a server reads cached receipts only; the launch sync checks.
    await waitFor(() => expect(serverAuth.readState).toHaveBeenCalled());
    expect(serverAuth.check).not.toHaveBeenCalled();
    // Any account on the page makes adding another a secondary action.
    expect(screen.getByRole("button", { name: "Add account" })).toHaveClass("secondary-button");
  });

  it("adds a token for the chosen host through one masked field and clears it before ingestion", async () => {
    let finish!: (id: string) => void;
    const { builtIn, serverToken } = setup({ providers: [github, server], tokenPort: { add: vi.fn(() => new Promise<string>(resolve => { finish = resolve; })) } });
    await userEvent.click(await screen.findByRole("button", { name: "Add account" }));
    const panel = screen.getByRole("group", { name: "Add account" });
    expect(within(panel).getByRole("radio", { name: /Token/ })).toBeChecked();
    expect(within(panel).getByRole("radio", { name: /github\.com/ })).toBeChecked();
    const input = within(panel).getByLabelText("Personal access token");
    expect(input).toHaveFocus(); expect(input).toHaveAttribute("type", "password");
    await userEvent.type(input, "fixture-secret-token-1234");
    await userEvent.click(within(panel).getByRole("button", { name: "Check and connect" }));
    expect(input).toHaveValue("");
    expect(builtIn.add).toHaveBeenCalledWith("fixture-secret-token-1234", expect.any(String));
    expect(serverToken.add).not.toHaveBeenCalled();
    expect(JSON.stringify(localStorage)).not.toContain("fixture-secret");
    await act(async () => { finish("github:token.octocat"); });
    expect(await screen.findByText("Token checked and saved.")).toBeVisible();
    expect(screen.queryByLabelText("Personal access token")).toBeNull();
    expect(screen.getByRole("button", { name: "Add account" })).toHaveFocus();
  });

  it("routes a company server's token to that server and shows its own permissions", async () => {
    const { builtIn, serverToken } = setup({ providers: [github, server] });
    await userEvent.click(await screen.findByRole("button", { name: "Add account" }));
    await userEvent.click(screen.getByRole("radio", { name: /ghe\.example\.com:8443/ }));
    await userEvent.click(screen.getByText("Which permissions does it need?"));
    expect(screen.getByText(/Create it on this server/)).toBeVisible();
    await userEvent.type(screen.getByLabelText("Personal access token"), "fixture-secret-token-5678");
    await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    expect(serverToken.add).toHaveBeenCalledWith("fixture-secret-token-5678", expect.any(String));
    expect(builtIn.add).not.toHaveBeenCalled();
  });

  it("recovers a token saved behind a lost receipt and keeps the failure visible", async () => {
    const harness = setup();
    harness.builtIn.add = vi.fn(async () => { harness.state.rows = [token("github", "octocat")]; throw new Error("Lost receipt"); });
    await userEvent.click(await screen.findByRole("button", { name: "Add account" }));
    await userEvent.type(screen.getByLabelText("Personal access token"), "fixture-secret-token-1234");
    await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    expect(await screen.findByRole("group", { name: "@octocat" })).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
    expect(document.body.textContent).not.toContain("fixture-secret");
  });

  it("names the removed token, restores focus on dismissal and keeps the other connection", async () => {
    const harness = setup({ rows: [token("github", "work"), token("github", "personal")] });
    harness.builtIn.remove = vi.fn(async (id: string) => { harness.state.rows = harness.state.rows.filter(row => row.id !== id); });
    const work = await screen.findByRole("group", { name: "@work" });
    const trigger = within(work).getByRole("button", { name: /Remove token · @work/ });
    expect(trigger).toHaveTextContent("Remove");
    await userEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus(); expect(harness.builtIn.remove).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    const consent = screen.getByRole("group", { name: "Remove the token for @work?" });
    await userEvent.click(within(consent).getByRole("button", { name: "Remove token" }));
    expect(harness.builtIn.remove).toHaveBeenCalledExactlyOnceWith("github:token.work");
    expect(await screen.findByText("Token removed.")).toBeVisible();
    expect(screen.getByRole("group", { name: "@personal" })).toBeVisible();
  });

  it("explains an unavailable token without diagnostics", async () => {
    setup({ rows: [token("github", "octocat", { available: false, unavailableReason: "secure_storage_unavailable" })] });
    expect(await screen.findByText(/secure credential store is unavailable/)).toBeVisible();
  });

  it("asks for browser consent before starting gh and routes a server's sign-in to that server", async () => {
    const { auth, serverAuth } = setup({ providers: [github, server] });
    await userEvent.click(await screen.findByRole("button", { name: "Add account" }));
    await userEvent.click(screen.getByRole("radio", { name: /Browser/ }));
    const proceed = screen.getByRole("button", { name: "Continue in browser" });
    expect(proceed).toHaveFocus();
    expect(auth.connect).not.toHaveBeenCalled();
    await userEvent.click(proceed);
    expect(auth.connect).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    await userEvent.click(screen.getByRole("radio", { name: /Browser/ }));
    await userEvent.click(screen.getByRole("radio", { name: /ghe\.example\.com:8443/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue in browser" }));
    await waitFor(() => expect(serverAuth.login).toHaveBeenCalledOnce());
    expect(auth.connect).toHaveBeenCalledOnce();
  });

  it("keeps the browser method closed when the CLI is missing", async () => {
    setup({ cliAvailable: false });
    // With nothing connected, adding an account is the page's one accent action.
    expect(await screen.findByRole("button", { name: "Add account" })).toHaveClass("primary-button");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    await userEvent.click(screen.getByRole("radio", { name: /Browser/ }));
    expect(screen.getByText("Requires GitHub CLI (gh), which you can install below.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue in browser" })).toBeDisabled();
  });

  it("checks every host of the product from one action", async () => {
    const { accountPort, auth, serverAuth } = setup({ providers: [github, server] });
    await userEvent.click(await screen.findByRole("button", { name: "Check accounts" }));
    expect(accountPort.check).toHaveBeenCalledWith("github");
    expect(auth.check).toHaveBeenCalledOnce();
    await waitFor(() => expect(serverAuth.check).toHaveBeenCalledOnce());
  });
});

describe("company servers", () => {
  it("adds a server only after confirmation, then lists its accounts under its host", async () => {
    const { port } = setup();
    expect(await screen.findByText("No servers yet.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Add a server" }));
    const address = screen.getByLabelText("Server address");
    expect(address).toHaveFocus();
    await userEvent.type(address, "  https://ghe.example.com:8443  ");
    expect(port.add).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Check and add" }));
    expect(port.add).toHaveBeenCalledWith("github", "https://ghe.example.com:8443", expect.stringMatching(/^server_/));
    expect(await screen.findByText("Server added. Add its accounts above.")).toBeVisible();
    expect(await screen.findByRole("group", { name: "ghe.example.com:8443" })).toBeVisible();
    expect(within(screen.getByRole("group", { name: "GitHub Enterprise Server: ghe.example.com:8443" })).getByText("0 accounts")).toBeVisible();
  });

  it("explains a refused server and removes one only after its consequences are confirmed", async () => {
    const { port } = setup({ providers: [github, server] });
    port.add = vi.fn(async () => { throw { code: "unsupported_server", message: "", remediation: null }; });
    await screen.findByText("0 accounts");
    await userEvent.click(screen.getByRole("button", { name: "Add a server" }));
    await userEvent.type(screen.getByLabelText("Server address"), "gitlab.example.com");
    await userEvent.click(screen.getByRole("button", { name: "Check and add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't answer as a supported server");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Server address")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove server · ghe.example.com:8443" }));
    const consent = screen.getByRole("group", { name: "Remove ghe.example.com:8443?" });
    expect(consent).toHaveTextContent("gh and glab sessions stay");
    expect(port.remove).not.toHaveBeenCalled();
    await userEvent.click(within(consent).getByRole("button", { name: "Remove server" }));
    expect(port.remove).toHaveBeenCalledWith(server.id);
    expect(await screen.findByText("Server removed.")).toBeVisible();
  });
});

describe("GitLab browser connections", () => {
  it("explains glab's single session per server instead of starting a login over it", async () => {
    const gitlab = { id: "gitlab", host: "gitlab.com", kind: "gitlab" as const, builtIn: true };
    const session = { id: "gitlab:cli.7", provider: "gitlab", host: "gitlab.com", login: "dev", avatarDataUrl: null, available: true };
    const accountPort: AccountsPort = { readCatalog: vi.fn(async () => ({ providers: [gitlab], accounts: [session], busy: false })),
      check: vi.fn(async function (this: AccountsPort) { return this.readCatalog(); }), readProject: vi.fn(), selectProject: vi.fn() };
    const auth = { snapshot: { state: "connected" as const, operationId: null, needsCheck: false, account: session }, pending: false,
      check: vi.fn(async () => undefined), connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) };
    render(<LanguageProvider><ProviderConnectionsSettings auth={{ kind: "gitlab", controller: auth }} cliAvailable accountPort={accountPort}
      tokenPort={{ add: vi.fn(), remove: vi.fn(), cancel: vi.fn() }} /></LanguageProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Add account" }));
    await userEvent.click(screen.getByRole("radio", { name: /Browser/ }));
    expect(screen.getByText("GitLab CLI keeps one account per server. Sign out of @dev first.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue in browser" })).toBeDisabled();
    expect(auth.connect).not.toHaveBeenCalled();
  });
});
