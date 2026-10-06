import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import type { AccountCatalog, AccountsPort, TokenConnectionPort } from "../accounts";
import { BitbucketConnectionsSettings } from "./BitbucketConnectionsSettings";

afterEach(() => { cleanup(); localStorage.clear(); });

const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const bitbucket = { id: "bitbucket", host: "bitbucket.org", kind: "bitbucket" as const, builtIn: true };
const github = { id: "github", host: "github.com", kind: "github" as const, builtIn: true };
type Row = AccountCatalog["accounts"][number];
const row = (extra: Partial<Row> = {}): Row =>
  ({ id: `bitbucket:token.${uuid}`, provider: "bitbucket", host: "bitbucket.org", login: "luis", avatarDataUrl: null, available: true, ...extra });

function setup({ rows = [] as Row[], tokenPort = {} as Partial<TokenConnectionPort> } = {}) {
  const state = { rows };
  const catalog = (): AccountCatalog => ({ providers: [github, bitbucket], accounts: state.rows, busy: false });
  const accountPort: AccountsPort = {
    readCatalog: vi.fn(async () => catalog()), check: vi.fn(async () => catalog()), readProject: vi.fn(), selectProject: vi.fn(),
  };
  const port: TokenConnectionPort = {
    add: vi.fn(async () => `bitbucket:token.${uuid}`), remove: vi.fn(async () => { state.rows = []; }), cancel: vi.fn(async () => undefined), ...tokenPort,
  };
  render(<LanguageProvider><BitbucketConnectionsSettings accountPort={accountPort} tokenPort={port} /></LanguageProvider>);
  return { state, accountPort, port };
}

describe("Bitbucket token connections", () => {
  it("never shows an unread catalog as empty and renders the last receipt at once when shown again", async () => {
    let answer!: (catalog: AccountCatalog) => void;
    const catalog: AccountCatalog = { providers: [bitbucket], accounts: [row()], busy: false };
    const accountPort: AccountsPort = {
      readCatalog: vi.fn(() => new Promise<AccountCatalog>(resolve => { answer = resolve; })),
      check: vi.fn(async () => catalog), readProject: vi.fn(), selectProject: vi.fn(),
    };
    const view = () => <LanguageProvider><BitbucketConnectionsSettings accountPort={accountPort} /></LanguageProvider>;
    const first = render(view());
    expect(screen.queryByText("No accounts yet.")).toBeNull();
    await act(async () => { answer(catalog); });
    expect(screen.getByRole("group", { name: "@luis" })).toBeVisible();
    first.unmount();
    // Switching back from another provider: the next read is still pending.
    render(view());
    expect(screen.getByRole("group", { name: "@luis" })).toBeVisible();
    expect(screen.queryByText("No accounts yet.")).toBeNull();
    await act(async () => { answer(catalog); });
  });

  it("lists bitbucket.org accounts only, from cached receipts", async () => {
    const { accountPort } = setup({ rows: [row(), { ...row(), id: "github:token.octocat", provider: "github", host: "github.com", login: "octocat" }] });
    const host = await screen.findByRole("group", { name: "bitbucket.org" });
    expect(await within(host).findByRole("group", { name: "@luis" })).toBeVisible();
    expect(screen.queryByText("@octocat")).toBeNull();
    expect(accountPort.check).not.toHaveBeenCalled();
    // There is no browser connection to choose.
    expect(screen.queryByRole("radio", { name: /Browser/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Add account" })).toHaveClass("secondary-button");
  });

  it("checks Bitbucket accounts only when asked", async () => {
    const { accountPort } = setup({ rows: [row()] });
    await userEvent.click(await screen.findByRole("button", { name: "Check accounts" }));
    expect(accountPort.check).toHaveBeenCalledExactlyOnceWith("bitbucket");
  });

  it("adds a token through a masked field, clears it before ingestion and returns focus", async () => {
    let finish!: (id: string) => void;
    const { state, port } = setup({ tokenPort: { add: vi.fn(() => new Promise<string>(resolve => { finish = resolve; })) } });
    expect(await screen.findByText("No accounts yet.")).toBeVisible();
    const add = screen.getByRole("button", { name: "Add account" });
    expect(add).toHaveClass("primary-button");
    await userEvent.click(add);
    const panel = screen.getByRole("group", { name: "Add account" });
    const input = within(panel).getByLabelText("API token");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("type", "password");
    expect(within(panel).getByText(/read:repository:bitbucket/)).toBeInTheDocument();
    await userEvent.type(input, "fixture-bitbucket-secret-1234");
    await userEvent.click(within(panel).getByRole("button", { name: "Check and connect" }));
    expect(input).toHaveValue("");
    expect(port.add).toHaveBeenCalledWith("fixture-bitbucket-secret-1234", expect.any(String));
    expect(JSON.stringify(localStorage)).not.toContain("fixture-bitbucket-secret");
    state.rows = [row()];
    await act(async () => { finish(`bitbucket:token.${uuid}`); });
    expect(await screen.findByRole("status")).toHaveTextContent("Token checked and saved.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add account" })).toHaveFocus());
    expect(await screen.findByRole("group", { name: "@luis" })).toBeVisible();
  });

  it("explains a missing permission without exposing the token", async () => {
    setup({ tokenPort: { add: vi.fn(async () => { throw { code: "permission_denied", message: "", remediation: null }; }) } });
    await userEvent.click(await screen.findByRole("button", { name: "Add account" }));
    await userEvent.type(screen.getByLabelText("API token"), "fixture-bitbucket-secret-1234");
    await userEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Bitbucket refused this token.");
    expect(alert.textContent).not.toContain("fixture-bitbucket-secret");
    expect(screen.getByLabelText("API token")).toHaveValue("");
  });

  it("dismisses the form with Escape and confirms removal naming what stays valid", async () => {
    const { port } = setup({ rows: [row({ available: false, unavailableReason: "authentication_failed" })] });
    await userEvent.click(await screen.findByRole("button", { name: "Add account" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add account" })).toHaveFocus());
    expect(screen.getByText("Reconnect")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Remove token · @luis" }));
    const confirm = screen.getByRole("group", { name: "Remove the token for luis?" });
    expect(within(confirm).getByText(/stays valid at Atlassian/)).toBeVisible();
    await userEvent.click(within(confirm).getByRole("button", { name: "Remove token" }));
    expect(port.remove).toHaveBeenCalledWith(`bitbucket:token.${uuid}`);
    expect(await screen.findByRole("status")).toHaveTextContent("Token removed.");
  });
});
