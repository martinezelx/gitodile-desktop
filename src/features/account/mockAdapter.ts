import { SIGNED_OUT, transitionAccount, type AccountEvent, type AccountScenario, type AccountState } from "./domain";
import type { AccountPort } from "./port";

export function createMockAccountPort(delayMs = 3500): AccountPort & {
  setScenario(scenario: AccountScenario): void;
} {
  let state: AccountState = SIGNED_OUT;
  let sequence = 0;
  let scenario: AccountScenario = "success";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const send = (event: AccountEvent): void => {
    const next = transitionAccount(state, event);
    if (state === next) return;
    state = next;
    [...listeners].forEach((listener) => listener());
  };
  const clearTimer = (): void => { clearTimeout(timer); timer = undefined; };
  const cancel = (): void => { clearTimer(); send({ kind: "clear" }); };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setScenario(next) { scenario = next; },
    start() {
      clearTimer();
      const id = ++sequence;
      const request = { id, code: `GTDL · ${String((4820 + id) % 10000).padStart(4, "0")}`, startedAt: Date.now() };
      const outcome = scenario;
      if (outcome !== "waiting") timer = setTimeout(() => {
        timer = undefined;
        send({ kind: "complete", requestId: id, outcome,
          identity: { name: "Luis Martinez", email: "luis@example.com", initials: "LM", pro: outcome === "pro" } });
      }, delayMs);
      // Install the timer first: a subscriber may synchronously cancel or retry
      // when it observes waiting, and must be able to clear this exact attempt.
      send({ kind: "start", request });
      return request;
    },
    reopen() { send({ kind: "reopen" }); },
    cancel,
    signOut: cancel,
    dispose() { cancel(); listeners.clear(); },
  };
}
