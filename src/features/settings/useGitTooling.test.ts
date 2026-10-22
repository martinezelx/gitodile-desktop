import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GitDiagnostics, GitUpdateStatus } from "./domain";
import type { SettingsPort } from "./port";
import { useGitTooling } from "./useGitTooling";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function createPort(read: SettingsPort["readDiagnostics"], check: SettingsPort["checkUpdate"]): SettingsPort {
  return {
    readDiagnostics: read, readGhDiagnostics: read,
    readInstallationDetails: vi.fn(), revealGitLocation: vi.fn(),
    checkUpdate: check, checkGhUpdate: check,
    installGit: vi.fn(), installGh: vi.fn(),
    updateGit: vi.fn(), updateGh: vi.fn(),
    getIdentity: vi.fn(), setIdentity: vi.fn(),
    getDefaultBranch: vi.fn(), setDefaultBranch: vi.fn(),
    readLineEndings: vi.fn(), setLineEndings: vi.fn(),
    readPlatform: () => "windows", openGuidance: vi.fn(),
  };
}

describe.each(["git", "gh"] as const)("%s local tooling", (tool) => {
  it("retains an update answer only while the installed version stays the same", async () => {
    const read = vi.fn<SettingsPort["readDiagnostics"]>()
      .mockResolvedValueOnce({ state: "available", version: "2.80.0" })
      .mockResolvedValueOnce({ state: "available", version: "2.80.0" })
      .mockResolvedValueOnce({ state: "available", version: "2.81.0" });
    const check = vi.fn<SettingsPort["checkUpdate"]>()
      .mockResolvedValueOnce({ state: "update_available", cached: false })
      .mockResolvedValueOnce({ state: "up_to_date", cached: false });
    const { result } = renderHook(() => useGitTooling(createPort(read, check), tool));
    await waitFor(() => expect(result.current.diagnostics?.version).toBe("2.80.0"));
    await act(() => result.current.checkUpdate());
    await act(() => result.current.refreshDiagnostics());
    expect(result.current.updateStatus?.state).toBe("update_available");
    await act(() => result.current.refreshDiagnostics());
    expect(result.current.diagnostics?.version).toBe("2.81.0");
    expect(result.current.updateStatus).toBeNull();
    await act(() => result.current.checkUpdate());
    expect(result.current.updateStatus?.state).toBe("up_to_date");
  });

  it.each(["missing", "check_failed", "rejected"] as const)("clears the old update action after a %s local check", async (state) => {
    const read = vi.fn<SettingsPort["readDiagnostics"]>()
      .mockResolvedValueOnce({ state: "available", version: "2.80.0" });
    if (state === "rejected") read.mockRejectedValueOnce(new Error("transport failed"));
    else read.mockResolvedValueOnce({ state, version: null });
    const check = vi.fn<SettingsPort["checkUpdate"]>(async () => ({ state: "update_available", cached: false }));
    const { result } = renderHook(() => useGitTooling(createPort(read, check), tool));
    await waitFor(() => expect(result.current.diagnostics?.state).toBe("available"));
    await act(() => result.current.checkUpdate());
    await act(() => result.current.refreshDiagnostics());
    expect(result.current.updateStatus).toBeNull();
    expect(result.current.diagnostics?.state).toBe(state === "rejected" ? "check_failed" : state);
    expect(result.current.isRefreshingDiagnostics).toBe(false);
  });

  it("does not overlap local probes or update checks", async () => {
    const diagnostic = deferred<GitDiagnostics>();
    const update = deferred<GitUpdateStatus>();
    const read = vi.fn(() => diagnostic.promise);
    const check = vi.fn(() => update.promise);
    const { result } = renderHook(() => useGitTooling(createPort(read, check), tool));
    await act(async () => {
      await result.current.refreshDiagnostics();
      await result.current.checkUpdate();
    });
    expect(read).toHaveBeenCalledOnce();
    expect(check).not.toHaveBeenCalled();
    await act(async () => { diagnostic.resolve({ state: "available", version: "2.80.0" }); });
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.checkUpdate(); });
    await act(async () => {
      await result.current.checkUpdate();
      await result.current.refreshDiagnostics();
    });
    expect(check).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    await act(async () => {
      update.resolve({ state: "up_to_date", cached: false });
      await pending;
    });
    expect(result.current.updateStatus?.state).toBe("up_to_date");
    expect(result.current.isCheckingUpdate).toBe(false);
  });
});
