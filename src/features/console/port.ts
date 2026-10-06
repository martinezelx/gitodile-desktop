import type { ConsoleOperationId } from "./domain";

export type ConsoleQueryResult = {
  operationId: ConsoleOperationId;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  success: boolean;
  truncated: boolean;
};

/** The output's known layout; it only chooses colours. */
export type OutputShape = "status" | "commits" | "graph" | "branches" | "remotes" | "stashes" | "authors" | "plain";

/** What a typed command may do, as Rust classified it. */
export type ConsoleTier = "read" | "local_change" | "history_change" | "remote" | "destructive" | "never";

export type ConsoleRefusalReason =
  | "too_long" | "control_character" | "unclosed_quote" | "shell_syntax" | "not_git" | "missing_subcommand"
  | "global_option" | "unknown_subcommand" | "not_available" | "runs_program" | "writes_file" | "leaves_project"
  | "needs_terminal" | "tier_not_allowed";

export type ConsoleEffect = "reads_only" | "changes_project" | "changes_history" | "reaches_remote" | "can_lose_work";

/** One statement of what a change plan will do, read from the repository. */
export type PlanFact =
  | { kind: "stages"; files: string[]; total: number }
  | { kind: "commits"; line: string | null; files: number | null }
  | { kind: "switches"; target: string; create: boolean }
  | { kind: "creates_line"; name: string }
  | { kind: "creates_tag"; name: string }
  | { kind: "sets_aside"; files: number }
  | { kind: "applies_set_aside"; stash: string }
  | { kind: "reverts"; version: string }
  | { kind: "copies_version"; version: string }
  | { kind: "fetches"; remote: string | null }
  | { kind: "pulls"; remote: string | null }
  | { kind: "publishes"; remote: string | null; line: string | null; versions: number | null }
  | { kind: "asks_remote"; remote: string | null }
  | { kind: "skips_hooks"; typed: boolean };

/** Rust's answer to a typed line: a plan that may run, or why it won't. */
export type ConsolePlan = {
  planId: string | null;
  command: string | null;
  tier: ConsoleTier | null;
  effect: ConsoleEffect | null;
  /** A read runs at once; a change waits for `[s/N]` unless confirmations are off. */
  confirmation: "none" | "yes_no";
  shape: OutputShape;
  facts: PlanFact[];
  refusal: { reason: ConsoleRefusalReason; subject: string | null } | null;
};

/** Rust's reading of why a change failed; the output is still shown as is. */
export type ConsoleRunFailure = "hook_rejected" | "signing_failed" | "authentication_failed" | "remote_rejected" | "not_fast_forward";

export type ConsoleRunResult = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  success: boolean;
  truncated: boolean;
  shape: OutputShape;
  failure: ConsoleRunFailure | null;
};

type Session = { projectId: string; sessionEpoch: string };

export interface ConsolePort {
  run(request: Session & { operationId: ConsoleOperationId }): Promise<ConsoleQueryResult>;
  /**
   * Sends the typed line to Rust, which alone parses and classifies it.
   * `runHooks` is the Settings switch the guided flows pass the same way.
   */
  plan(request: Session & { line: string; runHooks: boolean }): Promise<ConsolePlan>;
  runPlan(request: Session & { planId: string }): Promise<ConsoleRunResult>;
  /** Runs a change plan with the person's answer, which Rust checks too. */
  runChange(request: Session & { planId: string; answer: string }): Promise<ConsoleRunResult>;
  getSettings(): Promise<ConsoleModes>;
  /** Turning confirmations off needs `confirmed`: the person accepted the dialog. */
  setConfirmChanges(request: { enabled: boolean; confirmed: boolean }): Promise<ConsoleModes>;
}

/** The console's setting, which Rust holds and checks on every plan. */
export type ConsoleModes = { confirmChanges: boolean };
