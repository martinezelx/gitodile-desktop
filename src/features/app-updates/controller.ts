import { useEffect, useSyncExternalStore } from "react";

import { registerInstallParticipant } from "../../runtime/install";
import type { StartupUpdateConfirmation, UpdateChannel, UpdateChannelSetting, UpdateState } from "./domain";
import { installReadyUpdate } from "./install";
import type { AppUpdatesPort } from "./port";

const STARTUP_SETTLE_MS = 5_000;
export const AUTOMATIC_CHECK_CADENCE_MS = 24 * 60 * 60 * 1_000;
const ACTIVE_STATE_POLL_MS = 150;
const disposalTokens = new WeakMap<AppUpdatesController, object>();

type Timer = ReturnType<typeof globalThis.setTimeout>;

export type AppUpdatesSnapshot = Readonly<{
  state: UpdateState;
  startupConfirmation: StartupUpdateConfirmation;
  automaticEnabled: boolean;
  /** Null until native memory has answered; the control waits for it rather
   * than presenting a guess as the person's choice. */
  channel: UpdateChannelSetting | null;
}>;

export type AppUpdatesController = Readonly<{
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppUpdatesSnapshot;
  initialize(): Promise<void>;
  setAutomaticEnabled(enabled: boolean): void;
  check(source?: "manual" | "background"): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  cancel(): Promise<UpdateState>;
  install(): Promise<UpdateState>;
  /** Follows the other channel from now on. Native memory forgets any
   * candidate found under the old one, so the settled state is idle and the
   * caller offers a fresh check. A no-op while a check, download or install
   * is running, and for the channel already in force. */
  setChannel(channel: UpdateChannel): Promise<UpdateChannelSetting | null>;
  openManualDownload(): Promise<void>;
  dispose(): void;
}>;

export function createAppUpdatesController(
  port: AppUpdatesPort,
  options: Readonly<{
    automaticEnabled?: boolean;
    startupSettleMs?: number;
    now?: () => number;
    /** Told the settled state of every background check — the one the user
     * did not ask for and is not watching. Manual checks report to whoever
     * started them; this is how the app learns that a startup check found
     * something, so it can say so somewhere the user will see it. */
    onBackgroundCheckSettled?: (state: UpdateState) => void;
  }> = {},
): AppUpdatesController {
  const listeners = new Set<() => void>();
  const now = options.now ?? Date.now;
  const settleMs = options.startupSettleMs ?? STARTUP_SETTLE_MS;
  let snapshot: AppUpdatesSnapshot = {
    state: { kind: "idle" },
    startupConfirmation: { kind: "none" },
    automaticEnabled: options.automaticEnabled ?? false,
    channel: null,
  };
  let initialized: Promise<void> | null = null;
  let sharedCheck: Promise<UpdateState> | null = null;
  let sharedDownload: Promise<UpdateState> | null = null;
  let sharedInstall: Promise<UpdateState> | null = null;
  let downloadOperationId: string | null = null;
  let pollTimer: Timer | null = null;
  let automaticTimer: Timer | null = null;
  let lastAutomaticCheckAt: number | null = null;
  let suspended = false;
  let disposed = false;
  let unregisterParticipant: (() => void) | null = null;

  const publish = (next: Partial<AppUpdatesSnapshot>): void => {
    if (disposed) return;
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };

  const clearPoll = (): void => {
    if (pollTimer !== null) globalThis.clearTimeout(pollTimer);
    pollTimer = null;
  };

  const isActive = (state: UpdateState): boolean =>
    ["checking", "downloading", "verifying"].includes(state.kind);

  /** Commands start native work and return its first snapshot immediately.
   * Polling only mirrors that native owner; it does not infer transitions or
   * manufacture a renderer lifecycle. */
  const waitForSettled = (initial: UpdateState): Promise<UpdateState> => {
    publish({ state: initial });
    if (!isActive(initial) || disposed) return Promise.resolve(initial);
    return new Promise((resolve) => {
      const poll = (): void => {
        if (disposed) {
          resolve(snapshot.state);
          return;
        }
        clearPoll();
        pollTimer = globalThis.setTimeout(() => {
          void port.readState().then((state) => {
            publish({ state });
            if (isActive(state) && !disposed) poll();
            else resolve(state);
          }).catch(() => poll());
        }, ACTIVE_STATE_POLL_MS);
      };
      poll();
    });
  };

  const clearAutomaticTimer = (): void => {
    if (automaticTimer !== null) globalThis.clearTimeout(automaticTimer);
    automaticTimer = null;
  };

  const scheduleAutomaticCheck = (delay: number): void => {
    clearAutomaticTimer();
    if (!snapshot.automaticEnabled || suspended || disposed) return;
    automaticTimer = globalThis.setTimeout(() => {
      automaticTimer = null;
      if (!snapshot.automaticEnabled || suspended || disposed) return;
      lastAutomaticCheckAt = now();
      void check("background").then((state) => {
        if (!disposed) options.onBackgroundCheckSettled?.(state);
      }).finally(() => {
        scheduleAutomaticCheck(AUTOMATIC_CHECK_CADENCE_MS);
      });
    }, Math.max(0, delay));
  };

  const check = (source: "manual" | "background" = "manual"): Promise<UpdateState> => {
    if (sharedCheck) return sharedCheck;
    if (sharedDownload || sharedInstall) return Promise.resolve(snapshot.state);
    sharedCheck = port.check(source).then(({ state }) => waitForSettled(state)).catch(() => {
      const state: UpdateState = {
        kind: "failed",
        error: { code: "internal", stage: "check", retryable: true },
      };
      publish({ state });
      return state;
    }).finally(() => {
      sharedCheck = null;
    });
    return sharedCheck;
  };

  const registerAutomaticParticipant = (): void => {
    if (unregisterParticipant) return;
    // Ephemeral and renderer-local. The suffix prevents Strict Mode, tests or
    // hot replacement from colliding; it is never persisted or transmitted.
    const participantId = `app-update-automatic-checks-${crypto.randomUUID()}`;
    unregisterParticipant = registerInstallParticipant({
      id: participantId,
      label: "automatic application update checks",
      suspend: () => {
        suspended = true;
        clearAutomaticTimer();
        return () => {
          suspended = false;
          if (snapshot.automaticEnabled) {
            const elapsed = lastAutomaticCheckAt === null ? 0 : now() - lastAutomaticCheckAt;
            scheduleAutomaticCheck(Math.max(settleMs, AUTOMATIC_CHECK_CADENCE_MS - elapsed));
          }
        };
      },
    });
  };

  const controller: AppUpdatesController = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    initialize() {
      if (initialized) return initialized;
      registerAutomaticParticipant();
      // The channel is a convenience beside the lifecycle: a host that cannot
      // answer it leaves the control waiting, not the whole shell failed.
      initialized = Promise.all([port.readState(), port.readStartupConfirmation(), port.readChannel().catch(() => null)])
        .then(([state, startupConfirmation, channel]) => {
          // The typed native boundary always supplies these values. Keeping
          // the initial safe snapshot when an embedded/test host violates that
          // contract prevents the global shell from becoming unusable.
          if (state && startupConfirmation) publish({ state, startupConfirmation, channel: channel ?? null });
        })
        .catch(() => publish({
          state: { kind: "failed", error: { code: "internal", stage: "startup", retryable: true } },
        }))
        .then(() => {
          if (snapshot.automaticEnabled) scheduleAutomaticCheck(settleMs);
        });
      return initialized;
    },
    setAutomaticEnabled(enabled) {
      if (snapshot.automaticEnabled === enabled) return;
      publish({ automaticEnabled: enabled });
      if (enabled) scheduleAutomaticCheck(settleMs);
      else clearAutomaticTimer();
    },
    check,
    download() {
      if (sharedDownload) return sharedDownload;
      const candidate = "candidate" in snapshot.state ? snapshot.state.candidate : null;
      if (!candidate) return Promise.resolve(snapshot.state);
      sharedDownload = port.download(candidate.candidateId).then((action) => {
        downloadOperationId = action.operationId;
        return waitForSettled(action.state);
      }).catch(() => {
        const state: UpdateState = {
          kind: "failed",
          error: { code: "internal", stage: "download", retryable: true },
        };
        publish({ state });
        return state;
      }).finally(() => {
        sharedDownload = null;
      });
      return sharedDownload;
    },
    cancel() {
      const operationId = snapshot.state.kind === "checking" ? snapshot.state.operationId : null;
      if (operationId === null && snapshot.state.kind !== "downloading") return Promise.resolve(snapshot.state);
      // Download operation identity is intentionally native-owned. Read the
      // latest state: native returns its exact id in the action that began the
      // transfer, retained below by the closure rather than derived from UI.
      const activeId = operationId ?? downloadOperationId;
      if (activeId === null) return Promise.resolve(snapshot.state);
      return port.cancel(activeId).then((state) => {
        publish({ state });
        return state;
      });
    },
    install() {
      if (sharedInstall) return sharedInstall;
      if (snapshot.state.kind !== "ready" && snapshot.state.kind !== "blocked") {
        return Promise.resolve(snapshot.state);
      }
      const candidate = snapshot.state.candidate;
      sharedInstall = installReadyUpdate(port, candidate.candidateId).then((result) => {
        const state: UpdateState = result.kind === "submitted"
          ? result.state
          : {
              kind: "blocked",
              candidate,
              error: {
                code: "install_blocked",
                stage: "admission",
                retryable: true,
                safeDetail: result.label,
              },
            };
        publish({ state });
        return state;
      }).catch(() => {
        const state: UpdateState = {
          kind: "blocked",
          candidate,
          error: { code: "install_handoff_failed", stage: "install", retryable: true },
        };
        publish({ state });
        return state;
      }).finally(() => {
        sharedInstall = null;
      });
      return sharedInstall;
    },
    setChannel(channel) {
      if (sharedCheck || sharedDownload || sharedInstall || isActive(snapshot.state)) {
        return Promise.resolve(snapshot.channel);
      }
      if (snapshot.channel?.channel === channel) return Promise.resolve(snapshot.channel);
      return port.setChannel(channel)
        .then((setting) => port.readState().then((state) => {
          publish({ channel: setting, state });
          return setting;
        }))
        .catch(() => snapshot.channel);
    },
    openManualDownload: () => port.openManualDownload(),
    dispose() {
      if (disposed) return;
      disposed = true;
      clearPoll();
      clearAutomaticTimer();
      unregisterParticipant?.();
      unregisterParticipant = null;
      listeners.clear();
    },
  };

  return controller;
}

export function useAppUpdatesController(
  controller: AppUpdatesController,
  automaticEnabled: boolean,
): AppUpdatesSnapshot {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    const token = {};
    disposalTokens.set(controller, token);
    void controller.initialize();
    return () => {
      queueMicrotask(() => {
        if (disposalTokens.get(controller) !== token) return;
        disposalTokens.delete(controller);
        controller.dispose();
      });
    };
  }, [controller]);
  useEffect(() => controller.setAutomaticEnabled(automaticEnabled), [automaticEnabled, controller]);
  return snapshot;
}
