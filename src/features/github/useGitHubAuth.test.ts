import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_GITHUB_AUTH, GITHUB_DEVICE_URL, type GitHubAuthSnapshot } from "./domain";
import type { GitHubAuthPort } from "./port";
import { useGitHubAuth } from "./useGitHubAuth";

afterEach(() => { cleanup(); vi.useRealTimers(); });
function port(overrides: Partial<GitHubAuthPort> = {}): GitHubAuthPort {
  return { readState: vi.fn(async () => EMPTY_GITHUB_AUTH), check: vi.fn(async () => EMPTY_GITHUB_AUTH),
    login: vi.fn(async () => EMPTY_GITHUB_AUTH), logout: vi.fn(async () => EMPTY_GITHUB_AUTH), switchAccount: vi.fn(async () => EMPTY_GITHUB_AUTH), cancel: vi.fn(async () => EMPTY_GITHUB_AUTH),
    openBrowser: vi.fn(async () => undefined), ...overrides };
}
const waiting: GitHubAuthSnapshot = { ...EMPTY_GITHUB_AUTH, state: "awaiting_browser", operationId: "github-auth-1",
  deviceCode: "ABCD-1234", verificationUrl: GITHUB_DEVICE_URL };

describe("GitHub authentication lifecycle", () => {
  it("opening Settings only reads cached state, with no network or credential action", async () => {
    const api = port();
    const { rerender } = renderHook(({ visible }) => useGitHubAuth(api, visible), { initialProps: { visible: false } });
    expect(api.readState).not.toHaveBeenCalled();
    rerender({ visible: true });
    await waitFor(() => expect(api.readState).toHaveBeenCalledTimes(1));
    expect(api.check).not.toHaveBeenCalled(); expect(api.login).not.toHaveBeenCalled();
    expect(api.openBrowser).not.toHaveBeenCalled();
  });

  it("opens the fixed browser destination once, polls cached receipts and pauses while hidden", async () => {
    vi.useFakeTimers();
    const api = port({ readState: vi.fn(async () => waiting) });
    const { result, rerender } = renderHook(({ visible }) => useGitHubAuth(api, visible), { initialProps: { visible: true } });
    await act(async () => {});
    expect(result.current.snapshot.deviceCode).toBe("ABCD-1234");
    expect(api.openBrowser).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    const calls = vi.mocked(api.readState).mock.calls.length;
    expect(calls).toBe(3); expect(api.openBrowser).toHaveBeenCalledTimes(1);
    rerender({ visible: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(api.readState).toHaveBeenCalledTimes(calls);
    rerender({ visible: true }); await act(async () => {});
    expect(api.openBrowser).toHaveBeenCalledTimes(1);
    expect(api.check).not.toHaveBeenCalled();
  });

  it("a late cached read cannot overwrite the receipt of a newer explicit action", async () => {
    let finish!: (state: GitHubAuthSnapshot) => void;
    const checking: GitHubAuthSnapshot = { ...EMPTY_GITHUB_AUTH, state: "checking", operationId: "github-auth-2" };
    const api = port({ readState: vi.fn().mockImplementationOnce(() => new Promise<GitHubAuthSnapshot>((resolve) => { finish = resolve; }))
      .mockResolvedValue(checking), check: vi.fn(async () => checking) });
    const { result } = renderHook(() => useGitHubAuth(api, true));
    await act(async () => { await Promise.all([result.current.check(), result.current.check()]); });
    expect(api.check).toHaveBeenCalledTimes(1);
    await act(async () => { finish(EMPTY_GITHUB_AUTH); });
    expect(result.current.snapshot.operationId).toBe("github-auth-2");
  });

  it("cancels only the current operation and reports browser failure without losing the code", async () => {
    const cancelling: GitHubAuthSnapshot = { ...waiting, state: "cancelling" };
    const api = port({ readState: vi.fn().mockResolvedValueOnce(waiting).mockResolvedValue(cancelling),
      openBrowser: vi.fn().mockRejectedValueOnce(new Error("browser failed")).mockResolvedValue(undefined),
      cancel: vi.fn(async () => cancelling) });
    const { result } = renderHook(() => useGitHubAuth(api, true));
    await waitFor(() => expect(result.current.browserFailed).toBe(true));
    expect(result.current.snapshot.deviceCode).toBe("ABCD-1234");
    await act(async () => { await result.current.openBrowser(); });
    expect(result.current.browserFailed).toBe(false);
    await act(async () => { await result.current.cancel(); });
    expect(api.cancel).toHaveBeenCalledWith("github-auth-1");
  });

  it("does not open an unexpected verification address", async () => {
    const api = port({ readState: vi.fn(async () => ({ ...waiting, verificationUrl: "https://evil.example" })) });
    const { result } = renderHook(() => useGitHubAuth(api, true));
    await waitFor(() => expect(result.current.snapshot.state).toBe("awaiting_browser"));
    expect(api.openBrowser).not.toHaveBeenCalled();
  });

  it("recovers a lost launch receipt through the cached native state", async () => {
    const api = port({ login: vi.fn(async () => { throw new Error("lost receipt"); }), readState: vi.fn(async () => waiting) });
    const { result } = renderHook(() => useGitHubAuth(api, false));
    await act(async () => { await result.current.connect(); });
    expect(result.current.snapshot.operationId).toBe("github-auth-1");
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale logout target and serializes logout of the cached account", async () => {
    const connected: GitHubAuthSnapshot = { ...EMPTY_GITHUB_AUTH, state: "connected", account: {
      login: "octocat", host: "github.com", storage: "secure", avatarDataUrl: null } };
    const signingOut: GitHubAuthSnapshot = { ...connected, state: "signing_out", operationId: "github-auth-3" };
    const api = port({ readState: vi.fn(async () => connected), logout: vi.fn(async () => signingOut) });
    const { result, rerender } = renderHook(({ visible }) => useGitHubAuth(api, visible), { initialProps: { visible: true } });
    await waitFor(() => expect(result.current.snapshot.state).toBe("connected"));
    rerender({ visible: false });
    await act(async () => { await result.current.disconnect("another-account"); });
    expect(api.logout).not.toHaveBeenCalled();
    await act(async () => { await Promise.all([result.current.disconnect("octocat"), result.current.disconnect("octocat")]); });
    expect(api.logout).toHaveBeenCalledExactlyOnceWith("octocat");
    expect(result.current.snapshot.state).toBe("signing_out");
    await act(async () => { await result.current.cancel(); });
    expect(api.cancel).toHaveBeenCalledWith("github-auth-3");
  });

  it("restarts cached polling after a fast cancellation even when an older read is pending", async () => {
    vi.useFakeTimers();
    let finishOld!: (value: GitHubAuthSnapshot) => void;
    const checking: GitHubAuthSnapshot = { ...EMPTY_GITHUB_AUTH, state: "checking", operationId: "github-auth-4" };
    const cancelled: GitHubAuthSnapshot = { ...EMPTY_GITHUB_AUTH, state: "cancelled" };
    const api = port({ readState: vi.fn().mockResolvedValueOnce(checking)
      .mockImplementationOnce(() => new Promise<GitHubAuthSnapshot>((resolve) => { finishOld = resolve; }))
      .mockResolvedValue(cancelled), cancel: vi.fn(async () => ({ ...checking, state: "cancelling" as const })) });
    const { result } = renderHook(() => useGitHubAuth(api, true));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await act(async () => { await result.current.cancel(); });
    expect(result.current.snapshot.state).toBe("cancelled");
    await act(async () => { finishOld(checking); });
    expect(result.current.snapshot.state).toBe("cancelled");
  });

  it("switches only a known saved account, serializes receipts and blocks environment or uncertain changes", async () => {
    const active = { login: "octocat", host: "github.com" as const, storage: "secure" as const, avatarDataUrl: null };
    const saved = { ...active, login: "studio" };
    const connected: GitHubAuthSnapshot = { ...EMPTY_GITHUB_AUTH, state: "connected", account: active,
      accounts: [{ ...active, active: true, state: "connected" }, { ...saved, active: false, state: "connected" }] };
    const switching: GitHubAuthSnapshot = { ...connected, state: "switching", operationId: "switch-1" };
    const api = port({ readState: vi.fn(async () => connected), switchAccount: vi.fn(async () => switching) });
    const { result, rerender } = renderHook(({ visible }) => useGitHubAuth(api, visible), { initialProps: { visible: true } });
    await waitFor(() => expect(result.current.snapshot.account?.login).toBe("octocat"));
    rerender({ visible: false });
    await act(async () => { await result.current.activate("unknown"); await result.current.activate("octocat"); });
    expect(api.switchAccount).not.toHaveBeenCalled();
    await act(async () => { await Promise.all([result.current.activate("studio"), result.current.activate("studio")]); });
    expect(api.switchAccount).toHaveBeenCalledExactlyOnceWith("studio");
    expect(result.current.snapshot.state).toBe("switching");
    expect(api.login).not.toHaveBeenCalled();
    await act(async () => { await result.current.cancel(); });
    expect(api.cancel).toHaveBeenCalledWith("switch-1");
  });

  it("can sign out an inactive saved account and refuses changes after an uncertain mutation", async () => {
    const active = { login: "octocat", host: "github.com" as const, storage: "secure" as const, avatarDataUrl: null };
    const connected: GitHubAuthSnapshot = { ...EMPTY_GITHUB_AUTH, state: "connected", account: active,
      accounts: [{ ...active, active: true, state: "connected" }, { ...active, login: "studio", active: false, state: "connected" }] };
    const api = port({ readState: vi.fn(async () => connected), logout: vi.fn(async () => ({ ...connected, state: "failed" as const, needsCheck: true })) });
    const { result, rerender } = renderHook(({ visible }) => useGitHubAuth(api, visible), { initialProps: { visible: true } });
    await waitFor(() => expect(result.current.snapshot.state).toBe("connected")); rerender({ visible: false });
    await act(async () => { await result.current.disconnect("studio"); });
    expect(api.logout).toHaveBeenCalledExactlyOnceWith("studio");
    vi.mocked(api.check).mockRejectedValueOnce(new Error("unavailable"));
    vi.mocked(api.readState).mockRejectedValueOnce(new Error("unavailable"));
    await act(async () => { await result.current.check(); });
    expect(result.current.snapshot.needsCheck).toBe(true);
    await act(async () => { await result.current.activate("studio"); await result.current.disconnect("octocat"); });
    expect(api.switchAccount).not.toHaveBeenCalled(); expect(api.logout).toHaveBeenCalledTimes(1);
  });
});
