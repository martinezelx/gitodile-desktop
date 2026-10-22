import React, { useId, useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle, X } from "lucide-react";
import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { localizeAppError } from "../../shared/i18n";
import { moveFocusWithinRadioGroup, useDockedComposerFocus, useScrollAnchoredResize } from "../../shared/ui";
import type { Branch, BranchesSnapshot } from "./domain";
import { checkBranchName, prevailingBranchPrefix, type BranchNameIssue } from "./branchNames";
import type { BranchesPort } from "./port";
import { branchesPort } from "./tauriAdapter";

type QuickCreateStatus =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "error"; error: unknown }
  | { kind: "success"; name: string; switched: boolean };

/** What a quick create needs from its host: where the project is, and the
 * cross-session mutation lock every branch change takes. The Branches
 * composer and the quick switch's own create view take the same one. */
export type BranchCreateContext = {
  projectPath: string;
  sessionEpoch: string;
  /** Registers this create as a path-scoped mutation. Returns false when
   * another session sharing this Git directory already owns one, in which
   * case the create does nothing — the same silent refusal the Branches dialogs
   * get in that case. */
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  /** The snapshot the create returned. The host releases the lock on this
   * path; a failure releases it here. */
  onCreated: (snapshot: BranchesSnapshot) => void;
};

type BranchCreateOptions = BranchCreateContext & {
  port?: BranchesPort;
  /** Detached `HEAD`: the switch choice is locked on and explained rather
   * than offered, same as `CreateBranchDialog`'s own `forceSwitch`. The
   * source choice is hidden here too — recovering a detached commit means
   * starting at exactly where the project stands, never at "main" or
   * wherever else the project's active branch happens to be. */
  forceSwitch: boolean;
  /** The repository's default branch ("main", "master", "trunk", …), or
   * `null` on the rare repository with none flagged. One of the two things
   * a new branch can start from. */
  mainBranch: Branch | null;
  /** The project's current branch — the other thing a new branch can start
   * from, and the one it always started from silently before this choice
   * existed. Deliberately the *active* branch, not whichever row is merely
   * selected for viewing somewhere: browsing another branch without switching
   * to it must not silently change what a new branch branches from. */
  activeBranch: Branch | null;
  /** The names of the branches already loaded, for two things said before the
   * press: a typed name that clashes with one of them, and the prefix they
   * share, which becomes the name field's example. Rust checks the full set
   * again on create, so a truncated list only means an earlier warning is
   * missed, never that a clash gets through. */
  existingNames: readonly string[];
  /** Keys the unsaved-draft guard, so two creates on screen at once — the
   * Branches composer and a quick switch's — hold separate drafts. */
  draftKey: string;
  initialName?: string;
  /** Called the moment a create is actually sent, before Git is asked. */
  onSubmit?: () => void;
};

export type BranchCreateFlow = {
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
  mainBranch: Branch | null;
  activeBranch: Branch | null;
  showSourceChoice: boolean;
  resolvedSource: Branch | null;
  nameIssue: BranchNameIssue | null;
  blocksCreate: boolean;
  placeholder: string;
  /** How a name is written, by the project's own example. */
  example: string;
  issueId: string;
  create: () => Promise<void>;
};

/** One create, whichever frame it is drawn in: the name and what Git would
 * refuse in it, where the branch starts, whether to switch to it, and the two
 * calls that plan and make it. The Branches composer and the quick switch's
 * create view are two frames around this — which is what keeps them from
 * explaining one create two different ways.
 *
 * Unlike the quick commit box, a create takes the same cross-session
 * mutation lock every other branch change takes: saving a version never
 * moves `HEAD`, but creating a branch and switching to it — the default, same as
 * in the dialog — does, which is exactly what the lock exists to serialize
 * against another window sharing this Git directory. Acquired fresh on every
 * submit and released immediately after, success or failure — neither frame is
 * modal, so nothing forces the reader to see or dismiss a failure before doing
 * something else, and holding the lock past the request itself would leave it
 * blocking other work with no visible surface left to explain why. */
export function useBranchCreateFlow({
  port = branchesPort,
  projectPath,
  sessionEpoch,
  forceSwitch,
  mainBranch,
  activeBranch,
  existingNames,
  draftKey,
  initialName = "",
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
  onCreated,
  onSubmit,
}: BranchCreateOptions): BranchCreateFlow {
  const { t } = useLanguage();
  const [name, setName] = useState(initialName);
  const [switchChoice, setSwitchChoice] = useState(true);
  const [source, setSource] = useState<"main" | "active">("active");
  const [status, setStatus] = useState<QuickCreateStatus>({ kind: "idle" });
  // Set by a press that a name's ending refused (see `checkBranchName`'s
  // `submit` issues); any edit clears it, so the ending is judged again only
  // when the reader next asks to create.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const issueId = useId();
  useInstallDraftBlocker(draftKey, t.createBranchTitle, name.trim() !== "");

  /* A choice worth showing only when it changes the answer: two different
   * branches standing at the same commit would offer "main" and "active" as if
   * they meant something different when they don't (the common case — most
   * projects are already on their default branch most of the time), and a
   * detached `HEAD` has exactly one honest starting point regardless of
   * either (see `forceSwitch` above). Silent otherwise — `activeBranch` alone
   * already reproduces the original behavior. */
  const showSourceChoice =
    !forceSwitch && mainBranch !== null && activeBranch !== null && mainBranch.tip.commit !== activeBranch.tip.commit;
  /* `null` on a detached `HEAD` no matter what `mainBranch`/`activeBranch` say —
   * see `forceSwitch`'s own doc. Recovering a detached commit only works if
   * the create starts exactly where the project already stands. */
  const resolvedSource = forceSwitch
    ? null
    : showSourceChoice
      ? (source === "main" ? mainBranch : activeBranch)
      : (activeBranch ?? mainBranch);

  const isBusy = status.kind === "creating";
  const effectiveSwitch = forceSwitch || switchChoice;

  // What Git would refuse about the name, said under the field before the
  // press rather than as a failure after it. Checked as it will be sent —
  // trimmed — so a stray trailing space is not an error. What typing on can
  // never fix (a space inside, a forbidden character, a taken name) is said
  // at once and holds the button; how a half-typed name ends (`feature/`) is
  // said only once the reader asks to create.
  const nameCheck = checkBranchName(name.trim(), existingNames);
  const nameIssue = nameCheck && (nameCheck.when === "live" || submitAttempted) ? nameCheck.issue : null;
  const blocksCreate = nameCheck?.when === "live";
  // The example follows the project's own convention when it has one.
  // The field asks what the branch is for, the way the save box asks what
  // changed; how a name is written is said under it, by an example that
  // follows the project's own convention when it has one.
  const prefix = prevailingBranchPrefix(existingNames);
  const placeholder = t.branchesQuickCreateNamePlaceholder;
  const example = prefix
    ? t.branchesQuickCreateNameExampleFor(prefix)
    : t.branchesQuickCreateNameExample;

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
        // `CreateBranchDialog` does, rather than this request's own
        // value — the two calls stay in lockstep even if `activeBranch`
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
    mainBranch,
    activeBranch,
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
 * primitives.css): the plan branch over the field, what is wrong under it, and
 * the foot with "Switch to it" and the button. The frame around them — when
 * they open, fold and take focus — is the host's. */
export function BranchCreateFields({
  flow,
  nameRef,
  expanded,
  onClose,
}: {
  flow: BranchCreateFlow;
  nameRef: React.RefObject<HTMLInputElement | null>;
  /** Whether the box is open. At rest the button shares the field's row and
   * says only "Create", so the field's question is not cut; open, beside the
   * "Switch to it" that decides it, it says the whole consequence. */
  expanded: boolean;
  /** Only the docked frame folds; the quick-switch frame owns its header. */
  onClose?: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const { status, isBusy, forceSwitch, mainBranch, activeBranch, source, nameIssue } = flow;

  return (
    <>
      {/* Where the new branch starts, over the field it is about — the plan
          branch, known locally so it is there from the first frame. When the
          default branch and the active one differ, the choice between them is
          made right here rather than in the foot. On a detached `HEAD` the
          slot explains the one honest starting point instead. Once created,
          the same slot says what was created. */}
      <div className="docked-composer__head" inert={!expanded}>
        <div className={onClose ? "docked-composer__heading" : undefined}>
          {status.kind === "success" ? (
            <p className="docked-composer__line docked-composer__success row-in" role="status">
              <Check aria-hidden="true" />
              <span data-tooltip={t.branchesQuickCreateSuccess(status.name, status.switched)}>
                {t.branchesQuickCreateSuccess(status.name, status.switched)}
              </span>
            </p>
          ) : forceSwitch ? (
            <p className="branches-quick-create__note">{t.createBranchDetachedNote}</p>
          ) : flow.showSourceChoice ? (
            <div className="docked-composer__line branches-quick-create__from">
              <span>{t.branchesQuickCreateSourceLabel}</span>
              {/* Both options by their names, in the same mono as the branch
                  this slot names when there is no choice — "main" reads the
                  same whether or not it could have been something else; that
                  it is the main branch is on its tooltip. A segmented control,
                  always exactly two options and never more: real buttons rather than a label wrapping a hidden
                  radio input, which is what `FilterCapsule` builds — that
                  indirection is where a first version of this row lost
                  focus tracking the moment a reader clicked an option with an
                  empty name field. A directly-focusable button has no such
                  gap. */}
              <div
                className="segmented-control"
                role="radiogroup"
                aria-label={t.branchesQuickCreateSourceLabel}
                onKeyDown={moveFocusWithinRadioGroup}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={source === "main"}
                  tabIndex={source === "main" ? 0 : -1}
                  data-tooltip={t.branchesDefaultBranchChip}
                  className={`segmented-control__option segmented-control__option--mono${source === "main" ? " segmented-control__option--active" : ""}`}
                  disabled={isBusy}
                  onClick={() => flow.setSource("main")}
                >
                  {mainBranch?.name}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={source === "active"}
                  tabIndex={source === "active" ? 0 : -1}
                  data-tooltip={activeBranch?.name}
                  className={`segmented-control__option segmented-control__option--mono${source === "active" ? " segmented-control__option--active" : ""}`}
                  disabled={isBusy}
                  onClick={() => flow.setSource("active")}
                >
                  {activeBranch?.name}
                </button>
              </div>
            </div>
          ) : flow.resolvedSource ? (
            <p className="docked-composer__line branches-quick-create__from">
              <span>{t.branchesQuickCreateSourceLabel}</span>
              <span className="docked-composer__mono">{flow.resolvedSource.name}</span>
            </p>
          ) : null}
          {expanded && onClose && (
            <button
              type="button"
              className="docked-composer__close"
              aria-label={t.branchesQuickCreateClose}
              data-tooltip={t.commonClose}
              disabled={isBusy}
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <input
        ref={nameRef}
        className="docked-composer__field branches-quick-create__name"
        type="text"
        value={flow.name}
        disabled={isBusy}
        placeholder={flow.placeholder}
        aria-label={t.branchesQuickCreateNameLabel}
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

      <div className="docked-composer__extra" inert={!expanded}>
        <div>
          {/* The shared field-error look, at the field's own inset. Polite,
              so a reader using a screen reader hears it without it cutting
              into what they are typing. */}
          {/* While the field is empty: how a name is written, by example —
              the format the question in the field leaves unsaid. It gives
              way to what Git would refuse once there is a name to judge. */}
          {/* One branch whatever the language or the prefix: the word and the
              example, which truncates rather than wrapping; whole on its
              tooltip. That it is short and hyphenated the example shows. */}
          {!nameIssue && flow.name === "" && status.kind !== "error" && status.kind !== "success" && (
            <p
              className="branches-quick-create__hint"
              data-tooltip={`${t.branchesQuickCreateNameHint} ${flow.example}`}
            >
              <span>{t.branchesQuickCreateNameHint}</span>
              <span className="docked-composer__mono">{flow.example}</span>
            </p>
          )}
          {nameIssue && (
            <p id={flow.issueId} className="field-error branches-quick-create__issue" aria-live="polite">
              <CircleAlert aria-hidden="true" />
              {t.branchesNameIssue(nameIssue)}
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
            <span>{t.branchesQuickCreateSwitchLabel}</span>
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
                ? t.branchesQuickCreateConfirmAndSwitch
                : t.branchesQuickCreateConfirmLabel
              : undefined
          }
        >
          {isBusy ? (
            <>
              <LoaderCircle aria-hidden="true" className="icon--spinning" />
              {t.createBranchCreating}
            </>
          ) : !expanded ? (
            t.branchesQuickCreateConfirmShort
          ) : flow.effectiveSwitch ? (
            t.branchesQuickCreateConfirmAndSwitch
          ) : (
            t.branchesQuickCreateConfirmLabel
          )}
        </button>
      </div>
    </>
  );
}

/** How a branch is started on the Branches screen: a composer docked at the foot of
 * the Branches list, the sibling of Changes' `QuickCommitBox` and built the same
 * way (DESIGN.md, Changes). At rest it is one row — the name field and the
 * Create button beside it. It opens on focus and grows upward without
 * changing shape: where the branch starts over the field (with the choice of
 * start, when there is one), any failure under it, and a foot with "Switch to
 * it" and the button, whose label says what the press will do. When it folds
 * is `useDockedComposerFocus`, shared with Changes' box. The create itself is
 * `useBranchCreateFlow`, shared with the quick switch's create view. The full
 * dialog with its plan preview stays for the command palette and the
 * detached-`HEAD` banner. */
export function BranchQuickCreateBox({
  port,
  projectPath,
  sessionEpoch,
  forceSwitch,
  mainBranch,
  activeBranch,
  existingNames,
  listRef,
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
  onCreated,
}: BranchCreateContext & {
  port?: BranchesPort;
  forceSwitch: boolean;
  mainBranch: Branch | null;
  activeBranch: Branch | null;
  existingNames: readonly string[];
  /** The Branches list's own scroll container — this box shares a flex column
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

  const flow = useBranchCreateFlow({
    port,
    projectPath,
    sessionEpoch,
    forceSwitch,
    mainBranch,
    activeBranch,
    existingNames,
    draftKey: `quick-branch:${projectPath}`,
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

  function dismiss(): void {
    if (flow.isBusy) return;
    containerRef.current?.focus({ preventScroll: true });
    collapse();
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
      tabIndex={-1}
      className={`docked-composer branches-quick-create${expanded ? " docked-composer--expanded" : ""}`}
      {...focusHandlers}
      onKeyDown={(event) => {
        // Escape and the close button fold without losing the draft.
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <BranchCreateFields flow={flow} nameRef={nameRef} expanded={expanded} onClose={dismiss} />
    </div>
  );
}
