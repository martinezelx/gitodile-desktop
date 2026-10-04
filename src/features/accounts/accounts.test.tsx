import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { AccountPicker } from "./AccountPicker";
import { ProjectAccountSection } from "./ProjectAccountSection";
import { providerForSource, type AccountCatalog } from "./domain";
import type { AccountsPort } from "./port";
import { useAccounts } from "./useAccounts";

const catalog: AccountCatalog = {
  providers: [{ id: "github", host: "github.com" }, { id: "gitlab", host: "gitlab.com" }], busy: false,
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
    await userEvent.selectOptions(screen.getByRole("combobox"), "github:work");
    expect(onChange).toHaveBeenCalledWith("github:work");
    rerender(<AccountPicker catalog={catalog} provider="gitlab" value="gitlab:missing" onChange={onChange} onCheck={vi.fn()} />);
    expect(screen.getByRole("option", { name: /missing.*unavailable/ })).toBeDisabled();
    expect(screen.getByRole("option", { name: /studio/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /personal/ })).not.toBeInTheDocument();
  });

  it("reads only cached receipts on opening and saves separate provider bindings with the current epoch", async () => {
    const api = port();
    render(<ProjectAccountSection project={{ path: "/project", sessionEpoch: "epoch-1" }} port={api} />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toBeEnabled());
    expect(api.check).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getAllByRole("combobox")[0], "github:work");
    await waitFor(() => expect(api.selectProject).toHaveBeenCalledWith({ path: "/project", sessionEpoch: "epoch-1" }, "github", "github:work", null));
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "gitlab:studio");
    await waitFor(() => expect(api.selectProject).toHaveBeenCalledWith({ path: "/project", sessionEpoch: "epoch-1" }, "gitlab", "gitlab:studio", null));
  });

  it("recovers a lost write receipt from native preferences without pretending it rolled back", async () => {
    const api = port();
    api.readProject = vi.fn().mockResolvedValueOnce({ accountId: null }).mockResolvedValueOnce({ accountId: null })
      .mockResolvedValue({ accountId: "github:work" });
    api.selectProject = vi.fn().mockRejectedValue(new Error("lost receipt"));
    render(<ProjectAccountSection project={{ path: "/project", sessionEpoch: "epoch" }} port={api} />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toBeEnabled());
    await userEvent.selectOptions(screen.getAllByRole("combobox")[0], "github:work");
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toHaveValue("github:work"));
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
