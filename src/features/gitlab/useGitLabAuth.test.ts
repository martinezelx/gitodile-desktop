import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EMPTY_GITLAB_AUTH, type GitLabAuthSnapshot } from "./domain";
import type { GitLabAuthPort } from "./port";
import { useGitLabAuth } from "./useGitLabAuth";
afterEach(() => { cleanup(); vi.useRealTimers(); });
function port(overrides: Partial<GitLabAuthPort> = {}): GitLabAuthPort {
  return { readState: vi.fn(async () => EMPTY_GITLAB_AUTH), check: vi.fn(async () => EMPTY_GITLAB_AUTH),
    login: vi.fn(async () => EMPTY_GITLAB_AUTH), logout: vi.fn(async () => EMPTY_GITLAB_AUTH), cancel: vi.fn(async () => EMPTY_GITLAB_AUTH), ...overrides };
}
it("visibility reads only cached state and hidden Settings suspends polling", async () => {
  vi.useFakeTimers();
  const waiting: GitLabAuthSnapshot = { ...EMPTY_GITLAB_AUTH, state: "awaiting_browser", operationId: "glab-1" };
  const api = port({ readState: vi.fn(async () => waiting) });
  const { rerender } = renderHook(({ visible }) => useGitLabAuth(api, visible), { initialProps: { visible: false } });
  expect(api.readState).not.toHaveBeenCalled();
  rerender({ visible: true }); await act(async () => {});
  expect(api.readState).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(api.readState).toHaveBeenCalledTimes(2);
  rerender({ visible: false });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(api.readState).toHaveBeenCalledTimes(2);
  expect(api.check).not.toHaveBeenCalled(); expect(api.login).not.toHaveBeenCalled();
});
it("rejects a late cached receipt after an explicit check and keeps cancellation available", async () => {
  let finish!: (receipt: GitLabAuthSnapshot) => void;
  const checking: GitLabAuthSnapshot = { ...EMPTY_GITLAB_AUTH, state: "checking", operationId: "glab-2" };
  const api = port({ readState: vi.fn().mockImplementationOnce(() => new Promise<GitLabAuthSnapshot>(resolve => { finish = resolve; })).mockResolvedValue(checking), check: vi.fn(async () => checking) });
  const { result } = renderHook(() => useGitLabAuth(api, true));
  await act(async () => result.current.check());
  await act(async () => finish(EMPTY_GITLAB_AUTH));
  expect(result.current.snapshot.operationId).toBe("glab-2");
  await act(async () => result.current.cancel());
  expect(api.cancel).toHaveBeenCalledWith("glab-2");
});
