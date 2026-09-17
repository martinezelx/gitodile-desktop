import { useCallback, useRef, useState } from "react";
import { isAppError } from "../../shared/i18n";
import type { SaveVersionController } from "./controller";
import { PUBLISH_AFTER_SAVE_STORAGE_KEY, type SaveVersionPlan, type SaveVersionResult } from "./domain";

/** Where a save stands, from nothing asked yet to a version written.
 *
 * `ranHooks` on the failure records the attempt, not the preference: the
 * offer to retry without hooks is only honest when a hook actually ran, and
 * the preference can be read at any time while the failure is on screen. */
export type SaveVersionFlowState =
  | { status: "idle" }
  /** `plan` is the previous answer, kept on screen while a fresh one is
   * fetched, so a line that re-plans on every selection change does not
   * blink; `null` on the first ask. */
  | { status: "planning"; plan: SaveVersionPlan | null }
  | { status: "blocked"; error: unknown }
  | { status: "ready"; plan: SaveVersionPlan }
  | { status: "submitting"; plan: SaveVersionPlan }
  | { status: "save-error"; plan: SaveVersionPlan; error: unknown; ranHooks: boolean }
  | { status: "success"; result: SaveVersionResult };

export type SaveVersionPhase = "planning" | "executing" | "error" | "success";

/** The one save flow, in whichever frame shows it.
 *
 * `SaveVersionDialog` (Overview, Lines) and Changes' `QuickCommitBox` are the
 * same form asked in two shapes — a modal over a screen with nowhere to type,
 * and a box docked under the files it saves. The plan, the save, the failure
 * classification and the "also publish" preference are one implementation
 * here so the two cannot drift; what each frame owns is only its layout and
 * when it asks for the plan.
 *
 * Plans are tokened: a later `loadPlan` or a `cancel` makes an earlier
 * in-flight plan's answer fall on the floor, so a dialog that closed while
 * Git was still answering never repaints itself with a stale plan. */
export function useSaveVersionFlow({
  controller,
  projectPath,
  sessionEpoch,
  onSaved,
  onPublishNow,
  onPhaseChange,
}: {
  controller: SaveVersionController;
  projectPath: string;
  sessionEpoch: string;
  onSaved: () => void;
  /** Called after `onSaved` when the "also publish" preference is on — the
   * same handoff as pressing "Publish now" afterwards, without the click.
   * Publish still shows its own plan and asks its own confirmation before
   * anything leaves the machine. */
  onPublishNow: () => void;
  onPhaseChange?: (phase: SaveVersionPhase) => void;
}) {
  const [state, setState] = useState<SaveVersionFlowState>({ status: "idle" });
  /* Deliberately a standing preference ("I usually publish right after
   * saving"), not per-save input, and shared by both frames through one
   * storage key: checking it in the box is remembered by the dialog. */
  const [publishToo, setPublishToo] = useState<boolean>(
    () => localStorage.getItem(PUBLISH_AFTER_SAVE_STORAGE_KEY) === "1",
  );
  const togglePublishToo = useCallback((): void => {
    setPublishToo((current) => {
      const next = !current;
      localStorage.setItem(PUBLISH_AFTER_SAVE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  // Read through refs so the callbacks below keep one identity across
  // renders: the dialog hands them to effects and to `useModalFocus`, and
  // recreating them on every keystroke would tear those down each time.
  const onSavedRef = useRef(onSaved);
  const onPublishNowRef = useRef(onPublishNow);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const publishTooRef = useRef(publishToo);
  onSavedRef.current = onSaved;
  onPublishNowRef.current = onPublishNow;
  onPhaseChangeRef.current = onPhaseChange;
  publishTooRef.current = publishToo;

  const planToken = useRef(0);

  /** Asks Rust what a save of `selectedPaths` would do. Resolves with the
   * plan, or `null` when it failed (the state says why) or when a newer
   * request or a `cancel` superseded it. */
  const loadPlan = useCallback(async (selectedPaths: string[] | null): Promise<SaveVersionPlan | null> => {
    const token = ++planToken.current;
    setState((previous) => ({ status: "planning", plan: "plan" in previous ? previous.plan : null }));
    onPhaseChangeRef.current?.("planning");
    try {
      const plan = await controller.plan({ projectId: projectPath, sessionEpoch, selectedPaths });
      if (token !== planToken.current) return null;
      setState({ status: "ready", plan });
      return plan;
    } catch (error) {
      if (token !== planToken.current) return null;
      setState({ status: "blocked", error });
      return null;
    }
  }, [controller, projectPath, sessionEpoch]);

  /** Writes the version the plan described. Resolves `true` on success.
   *
   * `runHooks` is the attempt, not the preference: the escape offered after
   * a hook rejection passes `false` once, and nothing here writes that back. */
  const save = useCallback(async ({
    plan,
    title,
    description,
    selectedPaths,
    runHooks,
  }: {
    plan: SaveVersionPlan;
    title: string;
    description: string | null;
    selectedPaths: string[] | null;
    runHooks: boolean;
  }): Promise<boolean> => {
    planToken.current += 1;
    setState({ status: "submitting", plan });
    onPhaseChangeRef.current?.("executing");
    try {
      const result = await controller.save({
        projectId: projectPath,
        sessionEpoch,
        title,
        description,
        stateToken: plan.stateToken,
        selectedPaths,
        runHooks,
      });
      setState({ status: "success", result });
      onPhaseChangeRef.current?.("success");
      onSavedRef.current();
      if (publishTooRef.current) {
        onPublishNowRef.current();
      }
      return true;
    } catch (error) {
      setState({ status: "save-error", plan, error, ranHooks: runHooks });
      onPhaseChangeRef.current?.("error");
      return false;
    }
  }, [controller, projectPath, sessionEpoch]);

  /** Forgets any in-flight plan and returns to `idle`. */
  const cancel = useCallback((): void => {
    planToken.current += 1;
    setState((previous) => (previous.status === "idle" ? previous : { status: "idle" }));
  }, []);

  const plan = "plan" in state ? state.plan : null;
  /* Both halves matter. `hook_rejected` is Rust's best-effort classification,
     and it is only ever produced for an attempt that ran the hooks — but the
     attempt is what this asserts, so the escape can never be offered after a
     save that already skipped them. */
  const wasRejectedByHook =
    state.status === "save-error" &&
    state.ranHooks &&
    isAppError(state.error) &&
    state.error.code === "hook_rejected";

  return {
    state,
    plan,
    isBusy: state.status === "submitting",
    wasRejectedByHook,
    publishToo,
    togglePublishToo,
    loadPlan,
    save,
    cancel,
  };
}
