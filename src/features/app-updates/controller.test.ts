import { afterEach, describe, expect, it, vi } from "vitest";

import type { UpdateAction, UpdateState } from "./domain";
import { AUTOMATIC_CHECK_CADENCE_MS, createAppUpdatesController } from "./controller";
import type { AppUpdatesPort } from "./port";

function action(state: UpdateState, operationId: string | null = null): UpdateAction {
  return { state, operationId, coalesced: false };
}

function createPort(overrides: Partial<AppUpdatesPort> = {}): AppUpdatesPort {
  return {
    readState: vi.fn(async () => ({ kind: "idle" } as UpdateState)),
    readStartupConfirmation: vi.fn(async () => ({ kind: "none" } as const)),
    check: vi.fn(async () => action({ kind: "current", checkedAt: "2026-09-10T12:00:00Z" })),
    download: vi.fn(),
    cancel: vi.fn(),
    install: vi.fn(),
    openManualDownload: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("application update controller", () => {
  it("reads native memory without checking the network and coalesces entry points", async () => {
    let resolveCheck!: (result: UpdateAction) => void;
    const check = vi.fn(() => new Promise<UpdateAction>((resolve) => { resolveCheck = resolve; }));
    const port = createPort({ check });
    const controller = createAppUpdatesController(port);

    await controller.initialize();
    expect(check).not.toHaveBeenCalled();
    const fromMenu = controller.check();
    const fromPalette = controller.check();
    expect(fromPalette).toBe(fromMenu);
    expect(check).toHaveBeenCalledTimes(1);
    resolveCheck(action({ kind: "current", checkedAt: "2026-09-10T12:00:00Z" }));
    await expect(fromMenu).resolves.toMatchObject({ kind: "current" });
    controller.dispose();
  });

  it("does not schedule background network work until consent, then checks at most every 24 hours", async () => {
    vi.useFakeTimers();
    const port = createPort();
    const controller = createAppUpdatesController(port, { startupSettleMs: 1_000 });
    await controller.initialize();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(port.check).not.toHaveBeenCalled();

    controller.setAutomaticEnabled(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(port.check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(port.check).toHaveBeenCalledTimes(1);
    expect(port.check).toHaveBeenLastCalledWith("background");
    await vi.advanceTimersByTimeAsync(AUTOMATIC_CHECK_CADENCE_MS - 1);
    expect(port.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(port.check).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("reports what a background check settled on, and nothing about manual checks", async () => {
    vi.useFakeTimers();
    const candidate = {
      candidateId: "c1", version: "0.3.0", channel: "stable" as const, target: "windows-x86_64" as const,
      publishedAt: null, notes: "", expectedBytes: null,
    };
    const port = createPort({ check: vi.fn(async () => action({ kind: "available", candidate })) });
    const onBackgroundCheckSettled = vi.fn();
    const controller = createAppUpdatesController(port, {
      automaticEnabled: true, startupSettleMs: 1_000, onBackgroundCheckSettled,
    });
    await controller.initialize();
    await controller.check();
    expect(port.check).toHaveBeenLastCalledWith("manual");
    expect(onBackgroundCheckSettled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(port.check).toHaveBeenLastCalledWith("background");
    expect(onBackgroundCheckSettled).toHaveBeenCalledOnce();
    expect(onBackgroundCheckSettled).toHaveBeenCalledWith(expect.objectContaining({ kind: "available" }));
    controller.dispose();
  });

  it("uses the native operation id when cancelling a download", async () => {
    const candidate = {
      candidateId: "candidate-1", version: "0.2.0-preview.2", channel: "preview" as const,
      target: "windows-x86_64" as const, publishedAt: null, notes: "Notes", expectedBytes: null,
    };
    const cancel = vi.fn(async () => ({ kind: "cancelled", stage: "downloading" } as UpdateState));
    const port = createPort({
      readState: vi.fn(async () => ({ kind: "available", candidate } as UpdateState)),
      download: vi.fn(async () => action({
        kind: "downloading", candidate, transfer: { length: "unknown", receivedBytes: 0 },
      }, "download-operation")),
      cancel,
    });
    const controller = createAppUpdatesController(port);
    await controller.initialize();
    const download = controller.download();
    await Promise.resolve();
    await controller.cancel();
    expect(cancel).toHaveBeenCalledWith("download-operation");
    expect(controller.getSnapshot().state).toEqual({ kind: "cancelled", stage: "downloading" });
    controller.dispose();
    void download;
  });
});
