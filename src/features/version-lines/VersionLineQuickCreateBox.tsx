import React, { useId, useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { localizeAppError } from "../../shared/i18n";
import { moveFocusWithinRadioGroup, useDockedComposerFocus, useScrollAnchoredResize } from "../../shared/ui";
import type { VersionLine, VersionLinesSnapshot } from "./domain";
import { checkLineName, prevailingLinePrefix, type LineNameIssue } from "./lineNames";
import type { VersionLinesPort } from "./port";
import { versionLinesPort } from "./tauriAdapter";

type QuickCreateStatus =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "error"; error: unknown }
  | { kind: "success"; name: string; switched: boolean };

/** What a quick create needs from its host: where the project is, and the
 * cross-session mutation lock every version-line change takes. The Lines
 * composer and the quick switch's own create view take the same one. */
export type VersionLineCreateContext = {
  projectPath: string;
  sessionEpoch: string;
  /** Registers this create as a path-scoped mutation. Returns false when
   * another session sharing this Git directory already owns one, in which
   * case the create does nothing — the same silent refusal the Lines dialogs
   * get in that case. */
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  /** The snapshot the create returned. The host releases the lock on this
   * path; a failure releases it here. */
  onCreated: (snapshot: VersionLinesSnapshot) => void;
};

type LineCreateOptions = VersionLineCreateContext & {
  port?: VersionLinesPort;
  /** Detached `HEAD`: the switch choice is locked on and explained rather
   * than offered, same as `CreateVersionLineDialog`'s own `forceSwitch`. The
   * source choice is hidden here too — recovering a detached commit means
   * starting at exactly where the project stands, never at "main" or
   * wherever else the project's active line happens to be. */
  forceSwitch: boolean;
  /** The repository's default line ("main", "master", "trunk", …), or
   * `null` on the rare repository with none flagged. One of the two things
   * a new line can start from. */
  mainLine: VersionLine | null;
  /** The project's current line — the other thing a new line can start
   * from, and the one it always started from silently before this choice
   * existed. Deliberately the *active* line, not whichever row is merely
   * selected for viewing somewhere: browsing another line without switching
   * to it must not silently change what a new line branches from. */
  activeLine: VersionLine | null;
  /** The names of the lines already loaded, for two things said before the
   * press: a typed name that clashes with one of them, and the prefix they
   * share, which becomes the name field's example. Rust checks the full set
   * again on create, so a truncated list only means an earlier warning is
   * missed, never that a clash gets through. */
  existingNames: readonly string[];
  /** Keys the unsaved-draft guard, so two creates on screen at once — the
   * Lines composer and a quick switch's — hold separate drafts. */
  draftKey: string;
  initialName?: string;
  /** Called the moment a create is actually sent, before Git is asked. */
  onSubmit?: () => void;
};

export type LineCreateFlow = {
  name: string;
  changeName: (name: string) => void;
  clearName: () => void;
  switchChoice: boolean;
  toggleSwitch: () => void;
  source: "main" | "active";
  setSource: (source: "main" | "active") => void;
  status: QuickCreateStatus;
  resetStatus: () => void;
  isBusy: boolean;
  forceSwitch: boolean;
  effectiveSwitch: boolean;
  mainLine: VersionLine | null;
  activeLine: VersionLine | null;
  showSourceChoice: boolean;
  resolvedSource: VersionLine | null;
  nameIssue: LineNameIssue | null;
  blocksCreate: boolean;
  placeholder: string;
  /** How a name is written, by the project's own example. */
  example: string;
  issueId: string;
  create: () => Promise<void>;
};

/** One create, whichever frame it is drawn in: the name and what Git would
 * refuse in it, where the line starts, whether to switch to it, and the two
 * calls that plan and make it. The Lines composer and the quick switch's
 * create view are two frames around this — which is what keeps them from
 * explaining one create two different ways.
 *
 * Unlike the quick commit box, a create takes the same cross-session
 * mutation lock every other version-line change takes: saving a version never
 * moves `HEAD`, but creating a line and switching to it — the default, same as
 * in the dialog — does, which is exactly what the lock exists to serialize
 * against another window sharing this Git directory. Acquired fresh on every
 * submit and released immediately after, success or failure — neither frame is
 * modal, so nothing forces the reader to see or dismiss a failure before doing
 * something else, and holding the lock past the request itself would leave it
 * blocking other work with no visible surface left to explain why. */
export function useLineCreateFlow({
  port = versionLinesPort,
  projectPath,
  sessionEpoch,
  forceSwitch,
  mainLine,
  activeLine,
  existingNames,
  draftKey,
  initialName = "",
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
  onCreated,
  onSubmit,
}: LineCreateOptions): LineCreateFlow {
  const { t } = useLanguage();
  const [name, setName] = useState(initialName);
  const [switchChoice, setSwitchChoice] = useState(true);
  const [source, setSource] = useState<"main" | "active">("active");
  const [status, setStatus] = useState<QuickCreateStatus>({ kind: "idle" });
  // Set by a press that a name's ending refused (see `checkLineName`'s
  // `submit` issues); any edit clears it, so the ending is judged again only
  // when the reader next asks to create.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const issueId = useId();
  useInstallDraftBlocker(draftKey, "new version line name", name.trim() !== "");

  /* A choice worth showing only when it changes the answer: two different
   * lines standing at the same commit would offer "main" and "active" as if
   * they meant something different when they don't (the common case — most
   * projects are already on their default line most of the time), and a
   * detached `HEAD` has exactly one honest starting point regardless of
   * either (see `forceSwitch` above). Silent otherwise — `activeLine` alone
   * already reproduces the original behavior. */
  const showSourceChoice =
    !forceSwitch && mainLine !== null && activeLine !== null && mainLine.tip.commit !== activeLine.tip.commit;
  /* `null` on a detached `HEAD` no matter what `mainLine`/`activeLine` say —
   * see `forceSwitch`'s own doc. Recovering a detached commit only works if
   * the create starts exactly where the project already stands. */
  const resolvedSource = forceSwitch
    ? null
    : showSourceChoice
      ? (source === "main" ? mainLine : activeLine)
      : (activeLine ?? mainLine);

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
  // The field asks what the line is for, the way the save box asks what
  // changed; how a name is written is said under it, by an example that
  // follows the project's own convention when it has one.
  const prefix = prevailingLinePrefix(existingNames);
  const placeholder = t.versionLinesQuickCreateNamePlaceholder;
  const example = prefix
    ? t.versionLinesQuickCreateNameExampleFor(prefix)
    : t.versionLinesQuickCreateNameExample;

  async function create(): Promise<void> {
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
    onSubmit?.();
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
        // `CreateVersionLineDialog` does, rather than this request's own
        // value — the two calls stay in lockstep even if `activeLine`
        // changes locally between them.
        startCommit: plan.fromSavedVersion ? plan.startingCommit : null,
        stateToken: plan.stateToken,
      });
      onOperationPhaseChange("success");
      setName("");
      setStatus({ kind: "success", name: plan.name, switched: plan.willSwitch });
      // The host's `onCreated` releases the lock on this path.
      onCreated(nextSnapshot);
    } catch (error) {
      onOperationPhaseChange("error");
      setStatus({ kind: "error", error });
      // Released immediately rather than held through the error state: a
      // retry simply asks for the lock again, and nothing was mutated by the
      // failed attempt, so there is no claim to keep.
      onOperationFinish();
    }
  }

  return {
    name,
    changeName: (next) => {
      setName(next);
      setSubmitAttempted(false);
      if (status.kind === "success" || status.kind === "error") setStatus({ kind: "idle" });
    },
    clearName: () => setName(""),
    switchChoice,
    toggleSwitch: () => setSwitchChoice((value) => !value),
    source,
    setSource,
    status,
    resetStatus: () => setStatus({ kind: "idle" }),
    isBusy,
    forceSwitch,
    effectiveSwitch,
    mainLine,
    activeLine,
    showSourceChoice,
    resolvedSource,
    nameIssue,
    blocksCreate,
    placeholder,
    example,
    issueId,
    create,
  };
}

/** The fields of a create, in the docked-composer grid (`.docked-composer` in
 * primitives.css): the plan line over the field, what is wrong under it, and
 * the foot with "Switch to it" and the button. The frame around them — when
 * they open, fold and take focus — is the host's. */
export function LineCreateFields({
  flow,
  nameRef,
  expanded,
}: {
  flow: LineCreateFlow;
  nameRef: React.RefObject<HTMLInputElement | null>;
  /** Whether the box is open. At rest the button shares the field's row and
   * says only "Create", so the field's question is not cut; open, beside the
   * "Switch to it" that decides it, it says the whole consequence. */
  expanded: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const { status, isBusy, forceSwitch, mainLine, activeLine, source, nameIssue } = flow;

  return (
    <>
      {/* Where the new line starts, over the field it is about — the plan
          line, known locally so it is there from the first frame. When the
          default line and the active one differ, the choice between them is
          made right here rather than in the foot. On a detached `HEAD` the
          slot explains the one honest starting point instead. Once created,
          the same slot says what was created. */}
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
          ) : flow.showSourceChoice ? (
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
                  onClick={() => flow.setSource("main")}
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
                  onClick={() => flow.setSource("active")}
                >
                  {activeLine?.name}
                </button>
              </div>
            </div>
          ) : flow.resolvedSource ? (
            <p className="docked-composer__line version-lines-quick-create__from">
              <span>{t.versionLinesQuickCreateSourceLabel}</span>
              <span className="docked-composer__mono">{flow.resolvedSource.name}</span>
            </p>
          ) : null}
        </div>
      </div>

      <input
        ref={nameRef}
        className="docked-composer__field version-lines-quick-create__name"
        type="text"
        value={flow.name}
        disabled={isBusy}
        placeholder={flow.placeholder}
        aria-label={t.versionLinesQuickCreateNameLabel}
        aria-invalid={nameIssue ? true : undefined}
        aria-describedby={nameIssue ? flow.issueId : undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => flow.changeName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void flow.create();
          }
        }}
      />

      <div className="docked-composer__extra">
        <div>
          {/* The shared field-error look, at the field's own inset. Polite,
              so a reader using a screen reader hears it without it cutting
              into what they are typing. */}
          {/* While the field is empty: how a name is written, by example —
              the format the question in the field leaves unsaid. It gives
              way to what Git would refuse once there is a name to judge. */}
          {/* One line whatever the language or the prefix: the word and the
              example, which truncates rather than wrapping; whole on its
              tooltip. That it is short and hyphenated the example shows. */}
          {!nameIssue && flow.name === "" && status.kind !== "error" && status.kind !== "success" && (
            <p
              className="version-lines-quick-create__hint"
              data-tooltip={`${t.versionLinesQuickCreateNameHint} ${flow.example}`}
            >
              <span>{t.versionLinesQuickCreateNameHint}</span>
              <span className="docked-composer__mono">{flow.example}</span>
            </p>
          )}
          {nameIssue && (
            <p id={flow.issueId} className="field-error version-lines-quick-create__issue" aria-live="polite">
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
              checked={flow.switchChoice}
              disabled={isBusy}
              onChange={flow.toggleSwitch}
            />
            <span>{t.versionLinesQuickCreateSwitchLabel}</span>
          </label>
        )}
        <button
          className="primary-button primary-button--sm docked-composer__action"
          type="button"
          disabled={!flow.name.trim() || isBusy || flow.blocksCreate}
          onClick={() => void flow.create()}
          aria-label={
            !expanded && !isBusy
              ? flow.effectiveSwitch
                ? t.versionLinesQuickCreateConfirmAndSwitch
                : t.versionLinesQuickCreateConfirmLabel
              : undefined
          }
        >
          {isBusy ? (
            <>
              <LoaderCircle aria-hidden="true" className="icon--spinning" />
              {t.createVersionLineCreating}
            </>
          ) : !expanded ? (
            t.versionLinesQuickCreateConfirmShort
          ) : flow.effectiveSwitch ? (
            t.versionLinesQuickCreateConfirmAndSwitch
          ) : (
            t.versionLinesQuickCreateConfirmLabel
          )}
        </button>
      </div>
    </>
  );
}

/** How a line is started on the Lines screen: a composer docked at the foot of
 * the Lines list, the sibling of Changes' `QuickCommitBox` and built the same
 * way (DESIGN.md, Changes). At rest it is one row — the name field and the
 * Create button beside it. It opens on focus and grows upward without
 * changing shape: where the line starts over the field (with the choice of
 * start, when there is one), any failure under it, and a foot with "Switch to
 * it" and the button, whose label says what the press will do. When it folds
 * is `useDockedComposerFocus`, shared with Changes' box. The create itself is
 * `useLineCreateFlow`, shared with the quick switch's create view. The full
 * dialog with its plan preview stays for the command palette and the
 * detached-`HEAD` banner. */
export function VersionLineQuickCreateBox({
  port,
  projectPath,
  sessionEpoch,
  forceSwitch,
  mainLine,
  activeLine,
  existingNames,
  listRef,
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
  onCreated,
}: VersionLineCreateContext & {
  port?: VersionLinesPort;
  forceSwitch: boolean;
  mainLine: VersionLine | null;
  activeLine: VersionLine | null;
  existingNames: readonly string[];
  /** The Lines list's own scroll container — this box shares a flex column
   * with it, so opening or closing shrinks or grows that scroller by exactly
   * this box's own height change. See `useScrollAnchoredResize`. */
  listRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const { containerRef, snapshot } = useScrollAnchoredResize(listRef, expanded);
  // Only a real change takes a snapshot — see the same guard in
  // `QuickCommitBox`: a snapshot taken while already in the state asked for
  // is never consumed, and a later un-anchored fold would apply it.
  function beginExpandedChange(next: boolean): void {
    if (next === expanded) return;
    snapshot();
    setExpanded(next);
  }

  const flow = useLineCreateFlow({
    port,
    projectPath,
    sessionEpoch,
    forceSwitch,
    mainLine,
    activeLine,
    existingNames,
    draftKey: `quick-version-line:${projectPath}`,
    onOperationStart,
    onOperationFinish,
    onOperationPhaseChange,
    onCreated,
    onSubmit: () => beginExpandedChange(true),
  });

  function collapse(anchored: boolean = true): void {
    if (anchored) beginExpandedChange(false);
    else setExpanded(false);
    flow.resetStatus();
  }

  // When the box opens and folds is the rule every docked compose box shares:
  // see `useDockedComposerFocus`. Folding loses nothing only with no create
  // in flight and no name typed.
  const focusHandlers = useDockedComposerFocus({
    containerRef,
    fieldRef: nameRef,
    expanded,
    busy: flow.isBusy,
    canFold: !flow.isBusy && !flow.name.trim(),
    onOpen: () => beginExpandedChange(true),
    onFold: collapse,
  });

  return (
    <div
      ref={containerRef}
      className={`docked-composer version-lines-quick-create${expanded ? " docked-composer--expanded" : ""}`}
      {...focusHandlers}
      onKeyDown={(event) => {
        // Escape is the way out for "opened this by accident": it clears the
        // draft and folds the box back to its one-row rest state. Not offered
        // mid-create — the disabled fields are the signal then.
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          if (flow.isBusy) return;
          flow.clearName();
          collapse();
        }
      }}
    >
      <LineCreateFields flow={flow} nameRef={nameRef} expanded={expanded} />
    </div>
  );
}
