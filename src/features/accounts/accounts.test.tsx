import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { AccountPicker } from "./AccountPicker";
import { ProjectAccountSection } from "./ProjectAccountSection";
import { providerForSource, remoteAccountIssues, type AccountCatalog } from "./domain";
import type { AccountsPort } from "./port";
import { useAccounts } from "./useAccounts";

const catalog: AccountCatalog = {
  providers: [{ id: "github", host: "github.com", kind: "github", builtIn: true }, { id: "gitlab", host: "gitlab.com", kind: "gitlab", builtIn: true }], busy: false,
  accounts: [
    { id: "github:personal", provider: "github", host: "github.com", login: "personal", avatarDataUrl: null, available: true },
    { id: "github:work", provider: "github", host: "github.com", login: "work", avatarDataUrl: null, available: true },
    { id: "gitlab:studio", provider: "gitlab", host: "gitlab.com", login: "studio", avatarDataUrl: null, available: true },
  ],
};
function port(): AccountsPort {
  return { readCatalog: vi.fn().mockResolvedValue(catalog), check: vi.fn().mockResolvedValue(catalog),
    readProject: vi.fn().mockResolvedValue({ accountId: null }),
    selectProject: vi.fn().mockImplementation(async (_p, _provider, accountId) => ({ accountId })) };
}
const wrapper = ({ children }: { children: React.ReactNode }) => <LanguageProvider>{children}</LanguageProvider>;
afterEach(cleanup);

describe("shared provider accounts", () => {
  it("matches registered HTTPS hosts and rejects lookalikes, SSH and embedded credentials", () => {
    expect(providerForSource("https://github.com/org/repo.git", catalog.providers)).toBe("github");
    expect(providerForSource("https://gitlab.com/org/repo.git", catalog.providers)).toBe("gitlab");
    for (const source of ["https://github.com.evil.test/repo", "https://alice@github.com/repo", "https://github.com/repo?token=fixture", "http://github.com/repo", "git@github.com:org/repo", "https://github.com:8443/repo"]) {
      expect(providerForSource(source, catalog.providers)).toBeNull();
    }
  });

  it("uses one picker for either provider and preserves an unavailable selected identity", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<AccountPicker catalog={catalog} provider="github" value={null} onChange={onChange} onCheck={vi.fn()} />, { wrapper });
    expect(screen.queryByRole("option", { name: /studio/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: /@work/ }));
    expect(onChange).toHaveBeenCalledWith("github:work");
    rerender(<AccountPicker catalog={catalog} provider="gitlab" value="gitlab:missing" onChange={onChange} onCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: /missing.*unavailable/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: /studio/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /personal/ })).not.toBeInTheDocument();
  });

  it("reads only cached receipts on opening and saves separate provider bindings with the current epoch", async () => {
    const api = port();
    const { unmount } = render(<ProjectAccountSection project={{ path: "/project", sessionEpoch: "epoch-1" }}
      remoteUrls={["https://github.com/org/repo.git", "https://gitlab.com/org/repo.git"]} port={api} />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toBeEnabled());
    expect(api.check).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole("combobox")[0]);
    await userEvent.click(screen.getByRole("option", { name: /@work/ }));
    await waitFor(() => expect(api.selectProject).toHaveBeenCalledWith({ path: "/project", sessionEpoch: "epoch-1" }, "github", "github:work", null));
    await userEvent.click(screen.getAllByRole("combobox")[1]);
    await userEvent.click(screen.getByRole("option", { name: /@studio/ }));
    await waitFor(() => expect(api.selectProject).toHaveBeenCalledWith({ path: "/project", sessionEpoch: "epoch-1" }, "gitlab", "gitlab:studio", null));
    // Opening the project again renders the cached receipt and only reads.
    unmount();
    render(<ProjectAccountSection project={{ path: "/project", sessionEpoch: "epoch-1" }}
      remoteUrls={["https://github.com/org/repo.git"]} port={api} />, { wrapper });
    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
    expect(api.check).not.toHaveBeenCalled();
  });

  it("follows the project's HTTPS remotes and reads only the relevant provider binding", async () => {
    const api = port();
    const project = { path: "/project", sessionEpoch: "epoch-1" };
    const { rerender } = render(<ProjectAccountSection project={project}
      remoteUrls={["https://github.com/org/repo.git", "https://github.com/org/mirror.git"]} port={api} />, { wrapper });
    await waitFor(() => expect(screen.getByRole("combobox", { name: /github.com/ })).toBeEnabled());
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(api.readProject).toHaveBeenCalledExactlyOnceWith(project, "github");
    api.readProject = vi.fn().mockResolvedValue({ accountId: "gitlab:studio" });
    rerender(<ProjectAccountSection project={project} remoteUrls={["https://gitlab.com/org/repo.git"]} port={api} />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: /gitlab.com/ })).toBeEnabled());
    expect(screen.queryByRole("combobox", { name: /github.com/ })).not.toBeInTheDocument();
    expect(api.readProject).toHaveBeenCalledExactlyOnceWith(project, "gitlab");
    expect(api.check).not.toHaveBeenCalled();
    expect(api.selectProject).not.toHaveBeenCalled();
  });

  it("warns when a provider remote would bypass the selected account", async () => {
    const api = port();
    const project = { path: "/project", sessionEpoch: "epoch-1" };
    const { rerender } = render(<ProjectAccountSection project={project} port={api}
      remoteUrls={["https://github.com/org/repo.git", "https://gitlab.com/org/repo.git"]}
      signInRemoteUrls={["https://github.com/org/repo.git"]} />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(2));
    expect(screen.getAllByRole("note")).toHaveLength(1);
    expect(within(screen.getByRole("group", { name: "github.com" })).getByRole("note")).toHaveTextContent(/stores its own sign-in details/);
    rerender(<ProjectAccountSection project={project} port={api} remoteUrls={["http://gitlab.com/org/repo.git"]} />);
    await waitFor(() => expect(within(screen.getByRole("group", { name: "gitlab.com" })).getByRole("note")).toHaveTextContent(/uses HTTP/));
    expect(screen.getByRole("combobox", { name: /gitlab.com/ })).toBeInTheDocument();
    expect(api.selectProject).not.toHaveBeenCalled();
  });

  it("hides provider account settings for local, SSH and other-host projects", async () => {
    const api = port();
    const project = { path: "/project", sessionEpoch: "epoch-1" };
    const { rerender } = render(<ProjectAccountSection project={project} remoteUrls={[]} port={api} />, { wrapper });
    expect(screen.queryByRole("heading", { name: "HTTPS access" })).not.toBeInTheDocument();
    expect(api.readCatalog).not.toHaveBeenCalled();
    rerender(<ProjectAccountSection project={project} port={api} remoteUrls={[
      "git@github.com:org/repo.git", "ssh://git@gitlab.com/org/repo.git",
      "https://example.test/org/repo.git", "https://github.com.evil.test/org/repo.git",
    ]} />);
    await waitFor(() => expect(api.readCatalog).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("heading", { name: "HTTPS access" })).not.toBeInTheDocument());
    expect(api.readProject).not.toHaveBeenCalled();
    expect(api.check).not.toHaveBeenCalled();
  });

  it("previews keyboard choices, skips unchecked accounts, and keeps Escape inside the list", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const outerEscape = vi.fn();
    const unchecked = { ...catalog, accounts: catalog.accounts.map(account => ({ ...account, available: account.login !== "personal" })) };
    render(<div onKeyDown={event => { if (event.key === "Escape") outerEscape(); }}>
      <AccountPicker catalog={unchecked} provider="github" value={null} onChange={onChange} onCheck={vi.fn()} />
    </div>, { wrapper });
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(trigger).toHaveFocus();
    expect(document.getElementById(trigger.getAttribute("aria-activedescendant")!)).toHaveTextContent("@work");
    expect(onChange).not.toHaveBeenCalled();
    const unavailable = screen.getByRole("option", { name: /@personal.*Check connection/ });
    expect(unavailable).toHaveAttribute("aria-disabled", "true");
    await user.click(unavailable);
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(outerEscape).not.toHaveBeenCalled();
    // End reaches the account check; the account just above it is @work.
    await user.keyboard("{End}{ArrowUp}{Enter}");
    expect(onChange).toHaveBeenCalledWith("github:work");
    await user.keyboard("{Escape}");
    expect(outerEscape).toHaveBeenCalledOnce();
  });

  it("distinguishes token and browser connections for the same login and tabs back into the form", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const sameLogin = { ...catalog, accounts: [catalog.accounts[1], { ...catalog.accounts[1], id: "github:token.work" }] };
    render(<AccountPicker catalog={sameLogin} provider="github" value="github:token.work" onChange={onChange} onCheck={vi.fn()} />, { wrapper });
    const trigger = screen.getByRole("combobox", { name: /@work.*Token/ });
    await user.click(trigger);
    expect(screen.getByRole("option", { name: /@work.*Token/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /@work.*Browser/ })).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{Home}w{Enter}");
    expect(onChange).toHaveBeenCalledWith("github:work");
    await user.click(trigger);
    await user.tab();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).not.toHaveFocus();
  });

  it("checks accounts from the last menu item instead of a separate button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCheck = vi.fn();
    render(<AccountPicker catalog={catalog} provider="github" value={null} onChange={onChange} onCheck={onCheck} required />, { wrapper });
    expect(screen.queryByRole("button", { name: "Check accounts" })).toBeNull();
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await user.keyboard("{ArrowDown}{End}");
    expect(document.getElementById(trigger.getAttribute("aria-activedescendant")!)).toHaveTextContent("Check accounts");
    await user.keyboard("{Enter}");
    expect(onCheck).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("dismisses on outside interaction and when checking starts, including an empty provider", async () => {
    const user = userEvent.setup();
    const props = { provider: "gitlab", value: null, onChange: vi.fn(), onCheck: vi.fn(), required: true };
    const { rerender } = render(<AccountPicker {...props} catalog={{ ...catalog, accounts: [] }} />, { wrapper });
    await user.click(screen.getByRole("combobox"));
    // A required choice offers no "none" option; an empty provider says why
    // and still offers the account check.
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Check accounts"]);
    expect(screen.getByRole("listbox")).toHaveTextContent(/Connect an account in Settings/);
    expect(props.onCheck).not.toHaveBeenCalled();
    await user.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    rerender(<AccountPicker {...props} catalog={{ ...catalog, busy: true }} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("recovers a lost write receipt from native preferences without pretending it rolled back", async () => {
    const api = port();
    api.readProject = vi.fn().mockResolvedValueOnce({ accountId: null })
      .mockResolvedValue({ accountId: "github:work" });
    api.selectProject = vi.fn().mockRejectedValue(new Error("lost receipt"));
    render(<ProjectAccountSection project={{ path: "/project", sessionEpoch: "epoch" }}
      remoteUrls={["https://github.com/org/repo.git"]} port={api} />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toBeEnabled());
    await userEvent.click(screen.getAllByRole("combobox")[0]);
    await userEvent.click(screen.getByRole("option", { name: /@work/ }));
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("@work"));
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be checked or saved/);
  });

  it("ignores late catalog reads and stops cached polling when hidden", async () => {
    let resolve: (value: AccountCatalog) => void = () => undefined;
    const api = port();
    api.readCatalog = vi.fn().mockReturnValue(new Promise<AccountCatalog>(done => { resolve = done; }));
    function Harness({ visible }: { visible: boolean }) { const state = useAccounts(api, visible); return <span>{state.catalog.accounts.length}</span>; }
    const { rerender } = render(<Harness visible />);
    rerender(<Harness visible={false} />);
    await act(async () => resolve({ ...catalog, busy: true }));
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(api.readCatalog).toHaveBeenCalledTimes(1);
    expect(api.check).not.toHaveBeenCalled();
  });

  it("allows another explicit check after a busy receipt is lost", async () => {
    const api = port();
    api.readCatalog = vi.fn().mockResolvedValueOnce({ ...catalog, busy: true })
      .mockRejectedValueOnce(new Error("lost receipt")).mockResolvedValue(catalog);
    function Harness() {
      const state = useAccounts(api, true);
      return <button disabled={state.catalog.busy || state.pending} onClick={() => void state.check("github")}>
        {state.failed ? "Retry" : "Check"}
      </button>;
    }
    render(<Harness />);
    const retry = await screen.findByRole("button", {name: "Retry"});
    expect(retry).toBeEnabled();
    await userEvent.click(retry);
    await waitFor(() => expect(api.check).toHaveBeenCalledWith("github"));
    expect(await screen.findByRole("button", {name: "Check"})).toBeEnabled();
  });
});

describe("company server remotes", () => {
  it("match a provider instance by exact host and port", () => {
    const providers = [
      { id: "github", host: "github.com", kind: "github" as const, builtIn: true },
      { id: "ghe-0123456789", host: "ghe.example.com:8443", kind: "github" as const, builtIn: false },
    ];
    expect(providerForSource("https://ghe.example.com:8443/team/repo.git", providers)).toBe("ghe-0123456789");
    expect(providerForSource("https://ghe.example.com/team/repo.git", providers)).toBeNull();
    expect(providerForSource("https://github.com:444/team/repo.git", providers)).toBeNull();
    expect(remoteAccountIssues(["http://ghe.example.com:8443/team/repo.git"], [], providers).get("ghe-0123456789"))
      .toEqual({ issue: "insecure", host: "ghe.example.com:8443" });
  });
});

describe("Bitbucket remotes", () => {
  const providers = [
    { id: "github", host: "github.com", kind: "github" as const, builtIn: true },
    { id: "bitbucket", host: "bitbucket.org", kind: "bitbucket" as const, builtIn: true },
  ];
  it("get their own account picker beside other providers", () => {
    expect(providerForSource("https://bitbucket.org/studio/site.git", providers)).toBe("bitbucket");
    expect(providerForSource("https://github.com/team/repo.git", providers)).toBe("github");
    for (const source of ["https://luis@bitbucket.org/studio/site.git", "https://bitbucket.org:444/studio/site.git", "git@bitbucket.org:studio/site.git"]) {
      expect(providerForSource(source, providers)).toBeNull();
    }
  });
  it("warn when a Bitbucket remote stores sign-in details (its copied address) or uses HTTP", () => {
    // Sign-in remotes arrive redacted; the native side flags the stored username.
    expect(remoteAccountIssues([], ["https://bitbucket.org/studio/site.git"], providers).get("bitbucket"))
      .toEqual({ issue: "sign-in", host: "bitbucket.org" });
    expect(remoteAccountIssues(["http://bitbucket.org/studio/site.git"], [], providers).get("bitbucket"))
      .toEqual({ issue: "insecure", host: "bitbucket.org" });
  });
});
