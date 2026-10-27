export type AccountOutcome = "success" | "pro" | "offline" | "unfinished" | "expired" | "cancelled";
export type AccountScenario = AccountOutcome | "waiting";
export type AccountRequest = { id: number; code: string; startedAt: number };
export type AccountIdentity = { name: string; email: string; pro: boolean };
export type AccountState =
  | { kind: "signed-out" }
  | { kind: "waiting"; request: AccountRequest; reopened: number }
  | { kind: "signed-in"; requestId: number; identity: AccountIdentity }
  | { kind: "failed"; reason: "offline" | "unfinished" | "expired" };
export type AccountEvent =
  | { kind: "start"; request: AccountRequest }
  | { kind: "reopen" }
  | { kind: "clear" }
  | { kind: "complete"; requestId: number; outcome: AccountOutcome; identity: AccountIdentity };

export const SIGNED_OUT: AccountState = { kind: "signed-out" };

export function transitionAccount(state: AccountState, event: AccountEvent): AccountState {
  if (event.kind === "clear") return SIGNED_OUT;
  if (event.kind === "start") return { kind: "waiting", request: event.request, reopened: 0 };
  if (state.kind !== "waiting") return state;
  if (event.kind === "reopen") return { ...state, reopened: state.reopened + 1 };
  if (event.requestId !== state.request.id) return state;
  if (event.outcome === "cancelled") return SIGNED_OUT;
  if (event.outcome === "success" || event.outcome === "pro") {
    return { kind: "signed-in", requestId: event.requestId, identity: event.identity };
  }
  return { kind: "failed", reason: event.outcome };
}
