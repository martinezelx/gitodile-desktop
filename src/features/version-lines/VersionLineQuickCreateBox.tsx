import React, { useState } from "react";
import { CheckCircle2, CircleAlert, GitBranch, GitBranchPlus, LoaderCircle, X } from "lucide-react";
import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import { moveFocusWithinRadioGroup, useScrollAnchoredResize } from "../../shared/ui";
import type { VersionLine, VersionLinesSnapshot } from "./domain";
import type { VersionLinesPort } from "./port";
import { versionLinesPort } from "./tauriAdapter";

type QuickCreateStatus =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "error"; error: unknown }
  | { kind: "success"; name: string; switched: boolean };

/** The fast path for the common case, docked at the foot of the Lines list —
 * the sibling of Changes' `QuickCommitBox`, adapted to this screen's own
 * mutation. Closed, it is one row; it opens on focus and closes again on
 * blur, unless there is a name typed or a create in flight. "New line" in
 * the header still opens the full dialog with its plan preview, for the
 * cases that want one — the two are not exclusive.
 *
 * Unlike the quick commit box, this one takes the same cross-session
 * mutation lock every other version-line change on this screen already
 * takes (`onOperationStart`/`onOperationFinish`): saving a version never
 * moves `HEAD`, but creating a line and switching to it — the default here,
 * same as in the dialog — does, which is exactly what the lock exists to
 * serialize against another window sharing this Git directory. Acquired
 * fresh on every submit and released immediately after, success or failure
 * (see `handleCreate`) — unlike a dialog, this box is not modal, so nothing
 * forces the reader to see or dismiss a failure before doing something else,
 * and holding the lock past the request itself would leave it blocking
 * other work with no visible surface left to explain why. */
export function VersionLineQuickCreateBox({
  port = versionLinesPort,
  projectPath,
  sessionEpoch,
  /** Detached `HEAD`: the switch choice is locked on and explained rather
   * than offered, same as `CreateVersionLineDialog`'s own `forceSwitch`. The
   * source choice is hidden here too — recovering a detached commit means
   * starting at exactly where the project stands, never at "main" or
   * wherever else the project's active line happens to be. */
  forceSwitch,
  /** The repository's default line ("main", "master", "trunk", …), or
   * `null` on the rare repository with none flagged. One of the two things
   * this box can start a new line from. */
  mainLine,
  /** The project's current line — the other thing a new line can start
   * from, and the one this box always started from silently before this
   * choice existed. Deliberately the *active* line, not whichever row is
   * merely selected for viewing in the list behind this box: browsing
   * another line's detail without switching to it must not silently change
   * what a new line branches from. */
  activeLine,
  listRef,
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
  onCreated,
}: {
  port?: VersionLinesPort;
  projectPath: string;
  sessionEpoch: string;
  forceSwitch: boolean;
  mainLine: VersionLine | null;
  activeLine: VersionLine | null;
  /** The Lines list's own scroll container — this box shares a flex column
   * with it, so opening or closing shrinks or grows that scroller by exactly
   * this box's own height change. See `useScrollAnchoredResize`. */
  listRef: React.RefObject<HTMLDivElement | null>;
  /** Registers this create as a path-scoped mutation. Returns false when
   * another session sharing this Git directory already owns one, in which
   * case this box does nothing — the same silent refusal `VersionLinesPanel`
   * already gives the header's "New line" button in that case. */
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  onCreated: (snapshot: VersionLinesSnapshot) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [switchChoice, setSwitchChoice] = useState(true);
  const [source, setSource] = useState<"main" | "active">("active");
  const [status, setStatus] = useState<QuickCreateStatus>({ kind: "idle" });

  /* A choice worth showing only when it changes the answer: two different
   * lines standing at the same commit would offer "main" and "active" as if
   * they meant something different when they don't (the common case — most
   * projects are already on their default line most of the time), and a
   * detached `HEAD` has exactly one honest starting point regardless of
   * either (see `forceSwitch` above). Silent otherwise — `activeLine` alone
   * already reproduces this box's original behavior. */
  const showSourceChoice =
    !forceSwitch && mainLine !== null && activeLine !== null && mainLine.tip.commit !== activeLine.tip.commit;
  /* `null` on a detached `HEAD` no matter what `mainLine`/`activeLine` say —
   * see `forceSwitch`'s own doc. Recovering a detached commit only works if
   * this box starts exactly where the project already stands. */
  const resolvedSource = forceSwitch
    ? null
    : showSourceChoice
      ? (source === "main" ? mainLine : activeLine)
      : (activeLine ?? mainLine);
  const { containerRef, snapshot } = useScrollAnchoredResize(listRef, expanded);
  function beginExpandedChange(next: boolean): void {
    snapshot();
    setExpanded(next);
  }

  const isBusy = status.kind === "creating";
  const effectiveSwitch = forceSwitch || switchChoice;

  function clearStaleStatus(): void {
    if (status.kind === "success" || status.kind === "error") {
      setStatus({ kind: "idle" });
    }
  }

  function collapse(): void {
    beginExpandedChange(false);
    setStatus({ kind: "idle" });
  }

  /** The escape hatch for "opened this by accident": clears the draft and
   * folds the box back to its one-line rest state. Not offered mid-create —
   * the fields disabled then are the same signal Changes' box uses. */
  function handleDismiss(): void {
    if (isBusy) return;
    setName("");
    collapse();
  }

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || isBusy) {
      return;
    }
    if (!onOperationStart()) {
      return;
    }
    beginExpandedChange(true);
    setStatus({ kind: "creating" });
    onOperationPhaseChange("planning");
    try {
      const plan = await port.planCreate({
        projectId: projectPath,
        sessionEpoch,
        name: trimmed,
        switchToNew: effectiveSwitch,
        startCommit: resolvedSource?.tip.commit ?? null,
      });
      onOperationPhaseChange("executing");
      const nextSnapshot = await port.create({
        projectId: projectPath,
        sessionEpoch,
        name: plan.name,
        switchToNew: plan.willSwitch,
        // Trusts what the plan itself resolved and validated, the same way
        // `CreateVersionLineDialog` does, rather than this box's own request
        // value — the two calls stay in lockstep even if `activeLine`
        // changes locally between them.
        startCommit: plan.fromSavedVersion ? plan.startingCommit : null,
        stateToken: plan.stateToken,
      });
      onOperationPhaseChange("success");
      setName("");
      setStatus({ kind: "success", name: plan.name, switched: plan.willSwitch });
      // The caller's `onCreated` (wired to the same `handleMutated` every
      // dialog on this screen uses) releases the lock on this path.
      onCreated(nextSnapshot);
    } catch (error) {
      onOperationPhaseChange("error");
      setStatus({ kind: "error", error });
      // Released immediately rather than held through the error state: this
      // box is not a modal, so nothing forces the reader to see or dismiss
      // it before doing something else. Holding the lock here used to leave
      // `hasBlockingDialog` (App.tsx) silently refusing to switch projects
      // or open Settings, with no visible surface left to explain why. A
      // retry simply asks for the lock again, which is correct rather than
      // a shortcut worth protecting: nothing was mutated by the failed
      // attempt, so there is no claim to keep.
      onOperationFinish();
    }
  }

  return (
    <div
      ref={containerRef}
      className={`version-lines-quick-create${expanded ? " version-lines-quick-create--expanded" : ""}`}
      onFocus={() => beginExpandedChange(true)}
      onBlur={(event) => {
        if (containerRef.current?.contains(event.relatedTarget as Node | null)) return;
        if (isBusy || name.trim()) return;
        collapse();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          handleDismiss();
        }
      }}
    >
      <div className="version-lines-quick-create__field">
        <div className="version-lines-quick-create__name-wrap">
          <GitBranchPlus aria-hidden="true" />
          <input
            className="version-lines-quick-create__name"
            type="text"
            value={name}
            disabled={isBusy}
            placeholder={t.versionLinesQuickCreateNamePlaceholder}
            aria-label={t.versionLinesQuickCreateNameLabel}
            onChange={(event) => {
              setName(event.target.value);
              clearStaleStatus();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleCreate();
              }
            }}
          />
          {/* Hidden by CSS rather than left unmounted while closed — same
              idiom as `QuickCommitBox`'s own dismiss control. */}
          <button
            type="button"
            className="version-lines-quick-create__dismiss"
            aria-label={t.versionLinesQuickCreateDismiss}
            disabled={isBusy}
            onClick={handleDismiss}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="version-lines-quick-create__extra">
        <div>
          {status.kind === "error" && (
            <p className="version-lines-quick-create__error" role="alert">
              <CircleAlert aria-hidden="true" />
              {localizeAppError(status.error, t, t.errorGitCommandFailed)}
            </p>
          )}
          {status.kind === "success" && (
            <p className="version-lines-quick-create__success" role="status">
              <CheckCircle2 aria-hidden="true" />
              {t.versionLinesQuickCreateSuccess(status.name, status.switched)}
            </p>
          )}

          {forceSwitch && <p className="save-version-note">{t.createVersionLineDetachedNote}</p>}

          {/* One row for everything this box's own footer controls: where
              the line starts, whether to switch to it, and the action that
              reads both. Three controls is a lot for ~300px, so this row
              leans on the same `flex-wrap` `QuickCommitBox`'s foot already
              uses rather than reserving a line each — most of the time only
              the switch and the button are here at all (see
              `showSourceChoice`'s own doc for when the third joins them). */}
          <div className="version-lines-quick-create__foot">
            {showSourceChoice && (
              <div className="version-lines-quick-create__source">
                <span>{t.versionLinesQuickCreateSourceLabel}</span>
                {/* A segmented control, always exactly two options and never
                    more: real buttons rather than a label wrapping a hidden
                    radio input, which is what `FilterCapsule` builds — that
                    indirection is where a first version of this row lost
                    focus tracking (see the blur handler above) the moment a
                    reader clicked an option with an empty name field. A
                    directly-focusable button has no such gap. */}
                <div
                  className="segmented-control"
                  role="radiogroup"
                  aria-label={t.versionLinesQuickCreateSourceLabel}
                  onKeyDown={moveFocusWithinRadioGroup}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={source === "main"}
                    tabIndex={source === "main" ? 0 : -1}
                    className={`segmented-control__option${source === "main" ? " segmented-control__option--active" : ""}`}
                    disabled={isBusy}
                    onClick={() => setSource("main")}
                  >
                    {t.versionLinesDefaultLineChip}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={source === "active"}
                    tabIndex={source === "active" ? 0 : -1}
                    title={activeLine?.name}
                    className={`segmented-control__option${source === "active" ? " segmented-control__option--active" : ""}`}
                    disabled={isBusy}
                    onClick={() => setSource("active")}
                  >
                    {activeLine?.name}
                  </button>
                </div>
              </div>
            )}
            {!forceSwitch && (
              <div className="version-lines-quick-create__switch">
                <span>{t.versionLinesQuickCreateSwitchLabel}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={switchChoice}
                  aria-label={t.versionLinesQuickCreateSwitchLabel}
                  className={`toggle-switch${switchChoice ? " toggle-switch--on" : ""}`}
                  disabled={isBusy}
                  onClick={() => setSwitchChoice((value) => !value)}
                >
                  <span className="toggle-switch__knob" />
                </button>
              </div>
            )}

            <button
              className="primary-button primary-button--sm version-lines-quick-create__action"
              type="button"
              disabled={!name.trim() || isBusy}
              aria-label={t.versionLinesQuickCreateConfirmLabel}
              onClick={() => void handleCreate()}
            >
              {isBusy ? (
                <>
                  <LoaderCircle aria-hidden="true" className="icon--spinning" />
                  {t.createVersionLineCreating}
                </>
              ) : (
                <>
                  <GitBranch aria-hidden="true" />
                  {t.createVersionLineConfirm}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
