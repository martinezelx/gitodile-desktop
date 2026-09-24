import React, { useId, useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { localizeAppError } from "../../shared/i18n";
import { moveFocusWithinRadioGroup, useDockedComposerFocus, useScrollAnchoredResize } from "../../shared/ui";
import type { VersionLine, VersionLinesSnapshot } from "./domain";
import { checkLineName, prevailingLinePrefix } from "./lineNames";
import type { VersionLinesPort } from "./port";
import { versionLinesPort } from "./tauriAdapter";

type QuickCreateStatus =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "error"; error: unknown }
  | { kind: "success"; name: string; switched: boolean };

/** The fast path for the common case: a composer docked at the foot of the
 * Lines list, the sibling of Changes' `QuickCommitBox` and built the same way
 * (DESIGN.md, Changes). At rest it is one row — the name field and the
 * Create button beside it. It opens on focus and grows upward without
 * changing shape: where the line starts over the field (with the choice of
 * start, when there is one), any failure under it, and a foot with "Switch to
 * it" and the button, whose label says what the press will do. When it folds
 * is `useDockedComposerFocus`, shared with Changes' box. "New line" in the
 * header still opens the full dialog with its plan preview, for the cases
 * that want one — the two are not exclusive.
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
  existingNames,
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
  /** The names of the lines already loaded, for two things said before the
   * press: a typed name that clashes with one of them, and the prefix they
   * share, which becomes the name field's example. Rust checks the full set
   * again on create, so a truncated list only means an earlier warning is
   * missed, never that a clash gets through. */
  existingNames: readonly string[];
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
  const nameRef = useRef<HTMLInputElement>(null);
  // Set by a press that a name's ending refused (see `checkLineName`'s
  // `submit` issues); any edit clears it, so the ending is judged again only
  // when the reader next asks to create.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const issueId = useId();
  useInstallDraftBlocker(
    `quick-version-line:${projectPath}`,
    "new version line name",
    name.trim() !== "",
  );

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
  // Only a real change takes a snapshot — see the same guard in
  // `QuickCommitBox`: a snapshot taken while already in the state asked for
  // is never consumed, and a later un-anchored fold would apply it.
  function beginExpandedChange(next: boolean): void {
    if (next === expanded) return;
    snapshot();
    setExpanded(next);
  }

  const isBusy = status.kind === "creating";
  const effectiveSwitch = forceSwitch || switchChoice;

  // What Git would refuse about the name, said under the field before the
  // press rather than as a failure after it. Checked as it will be sent —
  // trimmed — so a stray trailing space is not an error. What typing on can
  // never fix (a space inside, a forbidden character, a taken name) is said
  // at once and holds the button; how a half-typed name ends (`feature/`) is
  // said only once the reader asks to create.
  const nameCheck = checkLineName(name.trim(), existingNames);
  const nameIssue = nameCheck && (nameCheck.when === "live" || submitAttempted) ? nameCheck.issue : null;
  const blocksCreate = nameCheck?.when === "live";
  // The example follows the project's own convention when it has one.
  const prefix = prevailingLinePrefix(existingNames);
  const placeholder = prefix
    ? t.versionLinesQuickCreateNamePlaceholderFor(prefix)
    : t.versionLinesQuickCreateNamePlaceholder;

  function clearStaleStatus(): void {
    if (status.kind === "success" || status.kind === "error") {
      setStatus({ kind: "idle" });
    }
  }

  function collapse(anchored: boolean = true): void {
    if (anchored) beginExpandedChange(false);
    else setExpanded(false);
    setStatus({ kind: "idle" });
  }

  // When the box opens and folds is the rule every docked compose box shares:
  // see `useDockedComposerFocus`. Folding loses nothing only with no create
  // in flight and no name typed.
  const focusHandlers = useDockedComposerFocus({
    containerRef,
    fieldRef: nameRef,
    expanded,
    busy: isBusy,
    canFold: !isBusy && !name.trim(),
    onOpen: () => beginExpandedChange(true),
    onFold: collapse,
  });

  /** Escape is the way out for "opened this by accident": it clears the draft
   * and folds the box back to its one-row rest state. Not offered
   * mid-create — the disabled fields are the signal then. */
  function handleDismiss(): void {
    if (isBusy) return;
    setName("");
    collapse();
  }

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || isBusy || blocksCreate) {
      return;
    }
    if (nameCheck) {
      // A name that only ends wrong: say so now, and ask Git for nothing.
      setSubmitAttempted(true);
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
      className={`docked-composer version-lines-quick-create${expanded ? " docked-composer--expanded" : ""}`}
      {...focusHandlers}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          handleDismiss();
        }
      }}
    >
      {/* Where the new line starts, over the field it is about — this box's
          plan line, known locally so it is there from the first frame. When
          the default line and the active one differ, the choice between them
          is made right here rather than in the foot. On a detached `HEAD`
          the slot explains the one honest starting point instead. Once
          created, the same slot says what was created. */}
      <div className="docked-composer__head">
        <div>
          {status.kind === "success" ? (
            <p className="docked-composer__line docked-composer__success row-in" role="status">
              <Check aria-hidden="true" />
              <span data-tooltip={t.versionLinesQuickCreateSuccess(status.name, status.switched)}>
                {t.versionLinesQuickCreateSuccess(status.name, status.switched)}
              </span>
            </p>
          ) : forceSwitch ? (
            <p className="version-lines-quick-create__note">{t.createVersionLineDetachedNote}</p>
          ) : showSourceChoice ? (
            <div className="docked-composer__line version-lines-quick-create__from">
              <span>{t.versionLinesQuickCreateSourceLabel}</span>
              {/* Both options by their names, in the same mono as the line
                  this slot names when there is no choice — "main" reads the
                  same whether or not it could have been something else; that
                  it is the main line is on its tooltip. A segmented control,
                  always exactly two options and never more: real buttons rather than a label wrapping a hidden
                  radio input, which is what `FilterCapsule` builds — that
                  indirection is where a first version of this row lost
                  focus tracking the moment a reader clicked an option with an
                  empty name field. A directly-focusable button has no such
                  gap. */}
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
                  data-tooltip={t.versionLinesDefaultLineChip}
                  className={`segmented-control__option segmented-control__option--mono${source === "main" ? " segmented-control__option--active" : ""}`}
                  disabled={isBusy}
                  onClick={() => setSource("main")}
                >
                  {mainLine?.name}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={source === "active"}
                  tabIndex={source === "active" ? 0 : -1}
                  data-tooltip={activeLine?.name}
                  className={`segmented-control__option segmented-control__option--mono${source === "active" ? " segmented-control__option--active" : ""}`}
                  disabled={isBusy}
                  onClick={() => setSource("active")}
                >
                  {activeLine?.name}
                </button>
              </div>
            </div>
          ) : resolvedSource ? (
            <p className="docked-composer__line version-lines-quick-create__from">
              <span>{t.versionLinesQuickCreateSourceLabel}</span>
              <span className="docked-composer__mono">{resolvedSource.name}</span>
            </p>
          ) : null}
        </div>
      </div>

      <input
        ref={nameRef}
        className="docked-composer__field version-lines-quick-create__name"
        type="text"
        value={name}
        disabled={isBusy}
        placeholder={placeholder}
        aria-label={t.versionLinesQuickCreateNameLabel}
        aria-invalid={nameIssue ? true : undefined}
        aria-describedby={nameIssue ? issueId : undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          setName(event.target.value);
          setSubmitAttempted(false);
          clearStaleStatus();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void handleCreate();
          }
        }}
      />

      <div className="docked-composer__extra">
        <div>
          {/* The shared field-error look, at the field's own inset. Polite,
              so a reader using a screen reader hears it without it cutting
              into what they are typing. */}
          {nameIssue && (
            <p id={issueId} className="field-error version-lines-quick-create__issue" aria-live="polite">
              <CircleAlert aria-hidden="true" />
              {t.versionLinesNameIssue(nameIssue)}
            </p>
          )}
          {status.kind === "error" && (
            <p className="docked-composer__error" role="alert">
              <CircleAlert aria-hidden="true" />
              {localizeAppError(status.error, t, t.errorGitCommandFailed)}
            </p>
          )}
        </div>
      </div>

      <div className="docked-composer__foot">
        {/* An option of this create, not a setting that takes effect on its
            own, so a checkbox rather than a switch; the button beside it says
            the consequence. Absent on a detached `HEAD`, where switching is
            not a choice — the head slot says why. */}
        {!forceSwitch && (
          <label className="docked-composer__option">
            <input
              className="app-checkbox"
              type="checkbox"
              checked={switchChoice}
              disabled={isBusy}
              onChange={() => setSwitchChoice((value) => !value)}
            />
            <span>{t.versionLinesQuickCreateSwitchLabel}</span>
          </label>
        )}
        <button
          className="primary-button primary-button--sm docked-composer__action"
          type="button"
          disabled={!name.trim() || isBusy || blocksCreate}
          onClick={() => void handleCreate()}
        >
          {isBusy ? (
            <>
              <LoaderCircle aria-hidden="true" className="icon--spinning" />
              {t.createVersionLineCreating}
            </>
          ) : effectiveSwitch ? (
            t.versionLinesQuickCreateConfirmAndSwitch
          ) : (
            t.versionLinesQuickCreateConfirmLabel
          )}
        </button>
      </div>
    </div>
  );
}
