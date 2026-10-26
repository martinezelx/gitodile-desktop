import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import type { AccountCatalog, AccountsPort, TokenConnectionPort } from "../accounts";
import { EMPTY_GITHUB_AUTH, type GitHubAuthController } from "../github";
import type { GitLabAuthController } from "../gitlab";
import { AccountsSettings, type AccountsTooling } from "./AccountsSettings";
import type { HostingServersPort } from "./port";

afterEach(() => { cleanup(); localStorage.clear(); });

const github = { id: "github", host: "github.com", kind: "github" as const, builtIn: true };
const gitlab = { id: "gitlab", host: "gitlab.com", kind: "gitlab" as const, builtIn: true };
const bitbucket = { id: "bitbucket", host: "bitbucket.org", kind: "bitbucket" as const, builtIn: true };
const server = { id: "ghe-0123456789", host: "ghe.example.com:8443", kind: "github" as const, builtIn: false };
const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
type Row = AccountCatalog["accounts"][number];
const HOSTS: Record<string, string> = { github: "github.com", gitlab: "gitlab.com", bitbucket: "bitbucket.org", [server.id]: server.host };
const token = (provider: string, login: string, extra: Partial<Row> = {}): Row =>
  ({ id: `${provider}:token.${login}`, provider, host: HOSTS[provider], login, avatarDataUrl: null, available: true, ...extra });

function githubController(): GitHubAuthController {
  return { snapshot: { ...EMPTY_GITHUB_AUTH, state: "signed_out" }, pending: false, browserFailed: false,
    check: vi.fn(async () => undefined), connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined),
    activate: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), openBrowser: vi.fn(async () => undefined) };
}

function gitlabController(account: Row | null = null): GitLabAuthController {
  return { snapshot: { state: account ? "connected" : "signed_out", operationId: null, needsCheck: false, account }, pending: false,
    check: vi.fn(async () => undefined), connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined) } as GitLabAuthController;
}

function tools(attention: { github?: "update" | "problem" | null; gitlab?: "update" | "problem" | null } = {}): AccountsTooling {
  return {
    github: { name: "GitHub tool", section: <section aria-label="GitHub CLI rows" />, inline: <div role="group" aria-label="GitHub tool row" />,
      attention: attention.github ?? null },
    gitlab: { name: "GitLab tool", section: <section aria-label="GitLab CLI rows" />, inline: <div role="group" aria-label="GitLab tool row" />,
      attention: attention.gitlab ?? null },
  };
}

function setup({ rows = [] as Row[], providers = [github, gitlab, bitbucket] as AccountCatalog["providers"], tokenPort, bitbucketPort,
  cliAvailable = true, gitlabAuth = gitlabController(), openMenu = false, onMenuOpened, tooling = tools() }: {
  rows?: Row[]; providers?: AccountCatalog["providers"]; tokenPort?: Partial<TokenConnectionPort>; bitbucketPort?: Partial<TokenConnectionPort>;
  cliAvailable?: boolean; gitlabAuth?: GitLabAuthController; openMenu?: boolean; onMenuOpened?: () => void; tooling?: AccountsTooling;
} = {}) {
  const state = { rows, providers };
  const accountPort: AccountsPort = {
    readCatalog: vi.fn(async () => ({ providers: state.providers, accounts: state.rows, busy: false })),
    check: vi.fn(async () => ({ providers: state.providers, accounts: state.rows, busy: false })), readProject: vi.fn(), selectProject: vi.fn(),
  };
  const builtIn: TokenConnectionPort = { add: vi.fn(async () => "github:token.x"), remove: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), ...tokenPort };
  const bitbucketToken: TokenConnectionPort = { add: vi.fn(async () => `bitbucket:token.${uuid}`), remove: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined), ...bitbucketPort };
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
  const auth = githubController();
  const view = (next: AccountsTooling) => <LanguageProvider><AccountsSettings github={{ controller: auth, cliAvailable }}
    gitlab={{ controller: gitlabAuth, cliAvailable }} tooling={next} openMenu={openMenu} onMenuOpened={onMenuOpened}
    port={port} accountPort={accountPort} tokenPorts={{ github: builtIn, bitbucket: bitbucketToken }} /></LanguageProvider>;
  const { rerender } = render(view(tooling));
  const retool = (next: AccountsTooling): void => rerender(view(next));
  return { state, accountPort, builtIn, bitbucketToken, serverToken, serverAuth, port, auth, gitlabAuth, retool };
}

/** Opens the provider menu and starts connecting an account of `provider`. */
async function connectWith(provider: "GitHub" | "GitLab" | "Bitbucket"): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole("button", { name: "Connect account" }));
  await userEvent.click(within(screen.getByRole("menu", { name: "Choose a provider" })).getByRole("menuitem", { name: new RegExp(`^${provider}`) }));
  return screen.getByRole("group", { name: `Connect a ${provider} account` });
}

async function expandProvider(name: "GitHub" | "GitLab" | "Bitbucket"): Promise<HTMLElement> {
  const block = await screen.findByRole("group", { name });
  await userEvent.click(within(block).getByRole("button", { expanded: false }));
  return block;
}

describe("one account list for every provider", () => {
  it("lists every provider's connections in one list, each under its own host", async () => {
    const { serverAuth } = setup({ providers: [github, server, gitlab, bitbucket],
      rows: [token(server.id, "saml_user"), token("gitlab", "dev"), token("bitbucket", "luis")] });
    const list = await screen.findByRole("region", { name: "Connected accounts" });
    const company = within(list).getByRole("group", { name: "ghe.example.com:8443" });
    expect(await within(company).findByRole("group", { name: "@saml_user" })).toBeVisible();
    expect(within(company).getByText("Company")).toBeVisible();
    expect(within(within(list).getByRole("group", { name: "gitlab.com" })).getByRole("group", { name: "@dev" })).toBeVisible();
    expect(within(within(list).getByRole("group", { name: "bitbucket.org" })).getByRole("group", { name: "@luis" })).toBeVisible();
    expect(screen.queryByText("No accounts yet.")).toBeNull();
    // Showing a server reads cached receipts only; the launch sync checks.
    await waitFor(() => expect(serverAuth.readState).toHaveBeenCalled());
    expect(serverAuth.check).not.toHaveBeenCalled();
    // Any account on the page makes connecting another a secondary action.
    expect(screen.getByRole("button", { name: "Connect account" })).toHaveClass("secondary-button");
  });

  it("never shows an unread catalog as empty and renders the last receipt at once when shown again", async () => {
    let answer!: (catalog: AccountCatalog) => void;
    const catalog: AccountCatalog = { providers: [bitbucket], accounts: [token("bitbucket", "luis")], busy: false };
    const accountPort: AccountsPort = {
      readCatalog: vi.fn(() => new Promise<AccountCatalog>(resolve => { answer = resolve; })),
      check: vi.fn(async () => catalog), readProject: vi.fn(), selectProject: vi.fn(),
    };
    const view = () => <LanguageProvider><AccountsSettings github={{ controller: githubController(), cliAvailable: true }}
      gitlab={{ controller: gitlabController(), cliAvailable: true }} accountPort={accountPort} /></LanguageProvider>;
    const first = render(view());
    expect(screen.queryByText("No accounts yet.")).toBeNull();
    await act(async () => { answer(catalog); });
    expect(screen.getByRole("group", { name: "@luis" })).toBeVisible();
    first.unmount();
    // Opening Accounts again: the next read is still pending.
    render(view());
    expect(screen.getByRole("group", { name: "@luis" })).toBeVisible();
    expect(screen.queryByText("No accounts yet.")).toBeNull();
    await act(async () => { answer(catalog); });
  });

  it("says once that nothing is connected and makes connecting the accent action", async () => {
    setup();
    expect(await screen.findByText("No accounts yet.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Connect account" })).toHaveClass("primary-button");
  });

  it("checks every provider in the list from one action", async () => {
    const { accountPort, auth, gitlabAuth, serverAuth } = setup({ providers: [github, server, gitlab, bitbucket] });
    await userEvent.click(await screen.findByRole("button", { name: "Check connections" }));
    await waitFor(() => expect(accountPort.check).toHaveBeenCalledTimes(3));
    expect(vi.mocked(accountPort.check).mock.calls.map(([provider]) => provider)).toEqual(["github", "gitlab", "bitbucket"]);
    expect(auth.check).toHaveBeenCalledOnce();
    expect(gitlabAuth.check).toHaveBeenCalledOnce();
    await waitFor(() => expect(serverAuth.check).toHaveBeenCalledOnce());
  });
});

describe("connecting an account", () => {
  it("chooses the provider from a menu that keeps Escape away from the dialog", async () => {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    try {
      setup();
      const trigger = await screen.findByRole("button", { name: "Connect account" });
      await userEvent.click(trigger);
      const menu = screen.getByRole("menu", { name: "Choose a provider" });
      expect(within(menu).getAllByRole("menuitem").map(item => item.textContent)).toEqual([
        "GitHub With the browser or a token", "GitLab With the browser or a token", "Bitbucket With an Atlassian API token", "Azure Repos With a personal access token",
      ]);
      expect(within(menu).getByRole("menuitem", { name: /^GitHub/ })).toHaveFocus();
      await userEvent.keyboard("{ArrowDown}");
      expect(within(menu).getByRole("menuitem", { name: /^GitLab/ })).toHaveFocus();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).toBeNull();
      expect(trigger).toHaveFocus();
      expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
    } finally { document.removeEventListener("keydown", outer); }
  });

  it("opens the menu on arrival when asked, once", async () => {
    const onMenuOpened = vi.fn();
    setup({ openMenu: true, onMenuOpened });
    expect(await screen.findByRole("menu", { name: "Choose a provider" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /^GitHub/ })).toHaveFocus();
    expect(onMenuOpened).toHaveBeenCalledOnce();
  });

  it("adds a token for the chosen host through one masked field and clears it before ingestion", async () => {
    let finish!: (id: string) => void;
    const { builtIn, serverToken } = setup({ providers: [github, server], tokenPort: { add: vi.fn(() => new Promise<string>(resolve => { finish = resolve; })) } });
    const panel = await connectWith("GitHub");
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
    expect(screen.getByRole("button", { name: "Connect account" })).toHaveFocus();
  });

  it("routes a company server's token to that server and shows its own permissions", async () => {
    const { builtIn, serverToken } = setup({ providers: [github, server] });
    await connectWith("GitHub");
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
    await connectWith("GitHub");
    await userEvent.type(screen.getByLabelText("Personal access token"), "fixture-secret-token-1234");
    await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    expect(await screen.findByRole("group", { name: "@octocat" })).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
    expect(document.body.textContent).not.toContain("fixture-secret");
  });

  it("asks for browser consent before starting gh and routes a server's sign-in to that server", async () => {
    const { auth, serverAuth } = setup({ providers: [github, server] });
    await connectWith("GitHub");
    await userEvent.click(screen.getByRole("radio", { name: /Browser/ }));
    const proceed = screen.getByRole("button", { name: "Continue in browser" });
    expect(proceed).toHaveFocus();
    expect(auth.connect).not.toHaveBeenCalled();
    await userEvent.click(proceed);
    expect(auth.connect).toHaveBeenCalledOnce();
    await connectWith("GitHub");
    await userEvent.click(screen.getByRole("radio", { name: /Browser/ }));
    await userEvent.click(screen.getByRole("radio", { name: /ghe\.example\.com:8443/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue in browser" }));
    await waitFor(() => expect(serverAuth.login).toHaveBeenCalledOnce());
    expect(auth.connect).toHaveBeenCalledOnce();
  });

  it("keeps the browser method closed when the CLI is missing and offers its row right there", async () => {
    setup({ cliAvailable: false });
    const panel = await connectWith("GitHub");
    expect(within(panel).queryByRole("group", { name: "GitHub tool row" })).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /Browser/ }));
    expect(screen.getByText("Connecting through the browser needs this tool (gh). A token works without it.")).toBeVisible();
    expect(within(panel).getByRole("group", { name: "GitHub tool row" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in browser" })).toBeDisabled();
  });

  it("offers no CLI row once the CLI is ready", async () => {
    setup();
    const panel = await connectWith("GitHub");
    await userEvent.click(within(panel).getByRole("radio", { name: /Browser/ }));
    expect(within(panel).queryByRole("group", { name: "GitHub tool row" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "Continue in browser" })).toBeEnabled();
  });

  it("explains glab's single session per server instead of starting a login over it", async () => {
    const session = { id: "gitlab:cli.7", provider: "gitlab", host: "gitlab.com", login: "dev", avatarDataUrl: null, available: true };
    const gitlabAuth = gitlabController(session);
    setup({ rows: [session], gitlabAuth });
    await connectWith("GitLab");
    await userEvent.click(screen.getByRole("radio", { name: /Browser/ }));
    expect(screen.getByText("GitLab CLI keeps one account per server. Sign out of @dev first.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue in browser" })).toBeDisabled();
    expect(gitlabAuth.connect).not.toHaveBeenCalled();
  });

  it("connects Bitbucket with an API token only and returns focus", async () => {
    let finish!: (id: string) => void;
    const { state, bitbucketToken } = setup({ bitbucketPort: { add: vi.fn(() => new Promise<string>(resolve => { finish = resolve; })) } });
    const panel = await connectWith("Bitbucket");
    // There is no browser connection to choose.
    expect(within(panel).queryByRole("radio")).toBeNull();
    const input = within(panel).getByLabelText("API token");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("type", "password");
    expect(within(panel).getByText(/read:repository:bitbucket/)).toBeInTheDocument();
    await userEvent.type(input, "fixture-bitbucket-secret-1234");
    await userEvent.click(within(panel).getByRole("button", { name: "Check and connect" }));
    expect(input).toHaveValue("");
    expect(bitbucketToken.add).toHaveBeenCalledWith("fixture-bitbucket-secret-1234", expect.any(String));
    expect(JSON.stringify(localStorage)).not.toContain("fixture-bitbucket-secret");
    state.rows = [token("bitbucket", "luis")];
    await act(async () => { finish(`bitbucket:token.${uuid}`); });
    expect(await screen.findByRole("status")).toHaveTextContent("Token checked and saved.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Connect account" })).toHaveFocus());
    expect(await screen.findByRole("group", { name: "@luis" })).toBeVisible();
  });

  it("explains a refused Bitbucket token without exposing it", async () => {
    setup({ bitbucketPort: { add: vi.fn(async () => { throw { code: "permission_denied", message: "", remediation: null }; }) } });
    await connectWith("Bitbucket");
    await userEvent.type(screen.getByLabelText("API token"), "fixture-bitbucket-secret-1234");
    await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Bitbucket refused this token.");
    expect(alert.textContent).not.toContain("fixture-bitbucket-secret");
  });
});

describe("removing a connection", () => {
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

  it("confirms a Bitbucket removal naming what stays valid", async () => {
    const { bitbucketToken } = setup({ rows: [token("bitbucket", uuid, { login: "luis", available: false, unavailableReason: "authentication_failed" })] });
    expect(await screen.findByText("Token rejected")).toBeVisible();
    expect(screen.getByText(/bitbucket.org rejected this saved token/)).toBeVisible();
    expect(screen.queryByText(/Check your Git credentials/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove token · @luis" }));
    const confirm = screen.getByRole("group", { name: "Remove the token for luis?" });
    expect(within(confirm).getByText(/stays valid at Atlassian/)).toBeVisible();
    await userEvent.click(within(confirm).getByRole("button", { name: "Remove token" }));
    expect(bitbucketToken.remove).toHaveBeenCalledWith(`bitbucket:token.${uuid}`);
  });
});

describe("provider blocks", () => {
  it("folds each provider behind a summary and shows its servers and CLI when opened", async () => {
    setup({ providers: [github, server, gitlab, bitbucket], rows: [token("github", "octocat"), token(server.id, "saml_user")] });
    const block = await screen.findByRole("group", { name: "GitHub" });
    const head = within(block).getByRole("button", { expanded: false });
    await waitFor(() => expect(head).toHaveTextContent("2 accounts · 1 company server · GitHub tool installed"));
    expect(within(screen.getByRole("group", { name: "Bitbucket" })).getByRole("button")).toHaveTextContent("0 accounts · API token only");
    expect(screen.queryByRole("region", { name: "GitHub CLI rows" })).toBeNull();
    await userEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    expect(within(block).getByRole("region", { name: "GitHub CLI rows" })).toBeVisible();
    expect(within(block).getByRole("region", { name: "GitHub Enterprise Server" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "GitLab CLI rows" })).toBeNull();
  });

  it("opens a block whose CLI asks for a look and says so while folded", async () => {
    setup({ rows: [token("github", "octocat")], tooling: tools({ github: "update", gitlab: "problem" }) });
    const block = await screen.findByRole("group", { name: "GitHub" });
    const head = within(block).getByRole("button", { expanded: true });
    await waitFor(() => expect(head).toHaveTextContent("1 account"));
    expect(head).toHaveTextContent("GitHub tool: update available");
    expect(head).not.toHaveTextContent("GitHub tool installed");
    expect(within(block).getByRole("region", { name: "GitHub CLI rows" })).toBeVisible();
    const gitlabHead = within(screen.getByRole("group", { name: "GitLab" })).getByRole("button", { expanded: true });
    expect(gitlabHead).toHaveTextContent("GitLab tool: needs attention");
    // An optional CLI that is simply not installed asks for nothing.
    expect(within(screen.getByRole("group", { name: "Bitbucket" })).getByRole("button", { expanded: false })).toBeInTheDocument();
  });

  it("opens a block when its CLI's answer arrives later, never against the reader and never folding by itself", async () => {
    const { retool } = setup();
    const block = await screen.findByRole("group", { name: "GitHub" });
    expect(within(block).getByRole("button", { expanded: false })).toBeInTheDocument();
    retool(tools({ github: "problem" }));
    const head = within(block).getByRole("button", { expanded: true });
    // The problem clears: the block stays where the reader is.
    retool(tools());
    expect(head).toHaveAttribute("aria-expanded", "true");
    // Folded by the reader, a later answer leaves it folded.
    await userEvent.click(head);
    retool(tools({ github: "update" }));
    expect(head).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps a half-typed server address while the block is folded", async () => {
    setup();
    const block = await expandProvider("GitHub");
    await userEvent.click(within(block).getByRole("button", { name: "Add a server" }));
    await userEvent.type(within(block).getByLabelText("Server address"), "https://ghe.example.com");
    const head = within(block).getByRole("button", { expanded: true });
    await userEvent.click(head);
    await userEvent.click(head);
    expect(within(block).getByLabelText("Server address")).toHaveValue("https://ghe.example.com");
  });
});

describe("company servers", () => {
  it("adds a server only after confirmation, then lists its accounts under its host", async () => {
    const { port } = setup();
    const block = await expandProvider("GitHub");
    expect(within(block).getByText("No servers yet.")).toBeVisible();
    await userEvent.click(within(block).getByRole("button", { name: "Add a server" }));
    const address = screen.getByLabelText("Server address");
    expect(address).toHaveFocus();
    await userEvent.type(address, "  https://ghe.example.com:8443  ");
    expect(port.add).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Check and add" }));
    expect(port.add).toHaveBeenCalledWith("github", "https://ghe.example.com:8443", expect.stringMatching(/^server_/));
    expect(await screen.findByText("Server added. Add its accounts above.")).toBeVisible();
    expect(await screen.findByRole("group", { name: "ghe.example.com:8443" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "GitHub Enterprise Server: ghe.example.com:8443" })).getByText("0 accounts")).toBeVisible();
  });

  it("explains a refused server and removes one only after its consequences are confirmed", async () => {
    const { port } = setup({ providers: [github, server] });
    port.add = vi.fn(async () => { throw { code: "unsupported_server", message: "", remediation: null }; });
    await expandProvider("GitHub");
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
