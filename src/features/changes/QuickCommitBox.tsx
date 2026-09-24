import React, { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleAlert, CloudUpload, LoaderCircle } from "lucide-react";
import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import { autoHideScrollbarProps, useDockedComposerFocus, useScrollAnchoredResize } from "../../shared/ui";
import { usePersistedInstallDraft } from "../../runtime/drafts";
import {
  createSaveVersionController,
  FailureDetail,
  getSaveVersionNotes,
  saveVersionPort,
  useSaveVersionFlow,
  type SaveVersionController,
} from "../save-version";

const defaultController = createSaveVersionController(saveVersionPort);

type QuickVersionMessage = { title: string; description: string };
const EMPTY_QUICK_MESSAGE: QuickVersionMessage = { title: "", description: "" };
const isEmptyQuickMessage = (draft: QuickVersionMessage): boolean =>
  draft.title === "" && draft.description === "";
const isQuickMessage = (value: unknown): value is QuickVersionMessage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Partial<QuickVersionMessage>).title === "string" &&
  typeof (value as Partial<QuickVersionMessage>).description === "string";

/** Sizes a textarea to what is written in it, within its CSS `min-height` and
 * `max-height`; past the maximum it scrolls. */
function fitToContent(field: HTMLTextAreaElement): void {
  field.style.height = "auto";
  const border = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + border}px`;
}

/** What the Changes screen can ask of the box from outside: open it and put
 * the caret in the name field. The screen's Ctrl/Cmd+S goes here. */
export type QuickCommitBoxHandle = { focus: () => void };

/** The one place a version is saved from the Changes screen: a composer
 * docked at the foot of the file list it saves, the way a chat or a commit
 * box sits under what it sends.
 *
 * At rest it is one row — the name field and the Save button beside it — so
 * the action is visible without costing the list a card's worth of height.
 * It opens on focus and grows upward without changing shape: the plan over
 * the field (`3 of 7 files → main`, from Rust), the details and any note that
 * applies under it, and a foot with "Also publish" and the button, whose
 * label says what the press will do. It closes again on blur unless there is
 * a draft or an operation in flight to protect. The flow underneath — plan,
 * save, hooks, "also publish" — is `useSaveVersionFlow`, the same one
 * `SaveVersionDialog` runs for the screens with nowhere to type. */
export function QuickCommitBox({
  ref,
  controller = defaultController,
  projectPath,
  sessionEpoch,
  selectedPaths,
  canSave,
  runHooks,
  remoteLabel,
  fileListRef,
  onSaveCompleted,
  onPublishNow,
}: {
  ref?: React.Ref<QuickCommitBoxHandle>;
  controller?: SaveVersionController;
  projectPath: string;
  sessionEpoch: string;
  selectedPaths: string[] | null;
  canSave: boolean;
  /** Passed straight through to the save request, same as `SaveVersionDialog`:
   * this box owns neither the preference nor the request, only the field. */
  runHooks: boolean;
  /** The upstream this would publish to, when one is already tracked — a
   * tooltip on "Also publish", so publishing is not a leap in the dark
   * without costing the foot a second line. `null` before a first publish,
   * when Publish itself is what asks which remote. */
  remoteLabel: string | null;
  /** The file list's own scroll container — this box shares a flex column
   * with it, so opening or closing shrinks or grows that scroller by exactly
   * this box's own height change. Scrolled to the bottom, the browser already
   * clamps `scrollTop` down to compensate on its own, which is why opening
   * this box only ever felt right there; scrolled to the middle, nothing
   * clamps it, and the rows nearest the box simply fall outside the
   * shortened viewport with no scroll to explain where they went. Matching
   * that clamp everywhere it doesn't happen for free is this ref's only job. */
  fileListRef: React.RefObject<HTMLDivElement | null>;
  onSaveCompleted: () => void;
  onPublishNow: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [messageDraft, setMessageDraft, clearMessageDraft] = usePersistedInstallDraft(
    `quick-save-version:${projectPath}`,
    "quick version message",
    EMPTY_QUICK_MESSAGE,
    isEmptyQuickMessage,
    isQuickMessage,
  );
  const { title, description } = messageDraft;

  // The details field fits what is written. Measured rather than left to
  // `field-sizing: content`, which WebKit — macOS and Linux — does not have.
  // Before paint, so a new line never shows a frame of scrollbar first; the
  // CSS `min-height` and `max-height` bound it, and past the maximum it
  // scrolls. Cleared drafts shrink it back the same way.
  useLayoutEffect(() => {
    if (descriptionRef.current) fitToContent(descriptionRef.current);
  }, [description]);
  // A change of width rewraps the same text into more or fewer lines — a
  // narrower window, the list column stepping down at 1200px — so the height
  // is measured again then too. Only on a change of width: the height this
  // sets is itself a resize, and answering it would loop.
  useEffect(() => {
    const field = descriptionRef.current;
    if (!field) return;
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      fitToContent(field);
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, []);
  const setTitle = (value: string): void =>
    setMessageDraft((current) => ({ ...current, title: value }));
  const setDescription = (value: string): void =>
    setMessageDraft((current) => ({ ...current, description: value }));

  const {
    state,
    plan,
    isBusy: isSubmitting,
    wasRejectedByHook,
    publishToo,
    togglePublishToo,
    loadPlan,
    save,
    cancel,
  } = useSaveVersionFlow({ controller, projectPath, sessionEpoch, onSaved: onSaveCompleted, onPublishNow });

  // Busy from the first keystroke of a save to its answer: the fresh plan a
  // save asks for first is not a moment to accept a second press.
  const [isSaving, setIsSaving] = useState(false);
  const isBusy = isSaving || isSubmitting;

  useImperativeHandle(ref, () => ({
    focus: () => titleRef.current?.focus(),
  }), []);

  // Keeps the file list's own scroll position anchored to this box's bottom
  // edge across every open/close, not just the lucky case where the list was
  // already scrolled to its end. See the `fileListRef` prop doc, and
  // `useScrollAnchoredResize`'s own doc, for why and how.
  const { containerRef, snapshot } = useScrollAnchoredResize(fileListRef, expanded);
  // Only a real change takes a snapshot: one taken while the box is already
  // in the state asked for is never consumed (the anchoring runs on a change
  // of `expanded`), and a later un-anchored fold would then apply it — moving
  // the list to where it stood when that stale snapshot was taken.
  function beginExpandedChange(next: boolean): void {
    if (next === expanded) return;
    snapshot();
    setExpanded(next);
  }

  // When the box opens and folds — never under the pointer, never because the
  // window lost focus — is the shared rule for docked compose boxes; see
  // `useDockedComposerFocus`. Folding loses nothing only with no save in
  // flight and no draft to protect. The fold after a press elsewhere skips
  // the scroll anchoring, so the row just pressed stays put.
  const focusHandlers = useDockedComposerFocus({
    containerRef,
    fieldRef: titleRef,
    expanded,
    busy: isBusy,
    canFold: !isBusy && !title.trim() && !description.trim(),
    onOpen: () => beginExpandedChange(true),
    onFold: (anchored) => (anchored ? beginExpandedChange(false) : setExpanded(false)),
  });

  // The plan is asked for when the box opens and again whenever the
  // selection under it changes — the checkboxes stay live while it is open,
  // unlike the dialog's inert list — and never while closed, so a row that
  // nobody is using costs Git nothing. Nothing selected is nothing to plan.
  // A save re-plans on its own for a fresh state token; a success is left
  // alone until the box closes.
  const selectedPathsRef = useRef(selectedPaths);
  selectedPathsRef.current = selectedPaths;
  const selectedPathsKey = selectedPaths === null ? null : selectedPaths.join("\n");
  const status = state.status;
  useEffect(() => {
    if (!expanded) {
      cancel();
      return;
    }
    if (!canSave || status === "submitting" || status === "success") return;
    void loadPlan(selectedPathsRef.current);
    // `status` is deliberately not a dependency: a plan that just landed must
    // not ask for itself again. Only opening and a changed selection ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, canSave, selectedPathsKey, loadPlan, cancel]);

  /** Escape is the way out for "opened this by accident": it clears whatever
   * draft is there and folds the box back to its one-row rest state. Not
   * offered mid-save — clearing what a request already captured would just
   * be confusing to watch. */
  function handleDismiss(): void {
    if (isBusy) return;
    clearMessageDraft();
    beginExpandedChange(false);
  }
  /** A success that is still on screen goes the moment the next draft
   * starts: the line is about the version that was saved, not this one. */
  function clearStaleStatus(): void {
    if (status === "success") {
      void loadPlan(selectedPaths);
    }
  }
  async function handleSave(attemptHooks: boolean = runHooks): Promise<void> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !canSave || isBusy) {
      return;
    }
    beginExpandedChange(true);
    setIsSaving(true);
    try {
      // A fresh plan for a fresh state token: the one the line was read from
      // may be older than the last keystroke in another editor.
      const freshPlan = await loadPlan(selectedPaths);
      if (!freshPlan) return;
      const saved = await save({
        plan: freshPlan,
        title: trimmedTitle,
        description: description.trim() ? description.trim() : null,
        selectedPaths,
        runHooks: attemptHooks,
      });
      if (saved) clearMessageDraft();
    } finally {
      setIsSaving(false);
    }
  }

  const isSaved = status === "success";
  // The plan line already reads "3 of 7 files", so the files left behind are
  // its to say; the notes are only what it cannot.
  const notes = plan && !isSaved ? getSaveVersionNotes(plan, t, { countStated: true }) : [];

  return (
    <div
      ref={containerRef}
      className={`docked-composer changes-quick-commit${expanded ? " docked-composer--expanded" : ""}`}
      {...focusHandlers}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          handleDismiss();
        }
      }}
    >
      {/* What the press will do, over the field it is about: the count
          first, then the line it lands on in the status bar's own mono. Once
          saved, the same slot says what was saved and offers the step after
          it. Kept one line tall while the plan loads, so the field under it
          does not jump when the answer arrives. */}
      <div className="docked-composer__head">
        <div>
          {isSaved ? (
            <p className="docked-composer__line docked-composer__success row-in" role="status">
              <Check aria-hidden="true" />
              {/* One line at the list's width, so a long name truncates;
                  the whole sentence stays on the tooltip. */}
              <span data-tooltip={t.saveVersionSuccessDescription(state.result.title, state.result.shortCommit)}>
                {t.saveVersionSuccessDescription(state.result.title, state.result.shortCommit)}
              </span>
            </p>
          ) : (
            <p className="docked-composer__line changes-quick-commit__plan">
              {/* The plan is Rust's answer, so it lands a beat after the box
                  opens: it arrives the way a new row does (`.row-in`) rather
                  than snapping on, and again whenever the selection changes
                  what it says. */}
              {plan && (
                <span
                  key={`${plan.totalFiles}/${plan.remainingFiles}/${plan.branch ?? ""}`}
                  className="changes-quick-commit__plan-body row-in"
                >
                  <span>{t.changesQuickCommitFiles(plan.totalFiles, plan.totalFiles + plan.remainingFiles)}</span>
                  {plan.branch && (
                    <>
                      <ArrowRight aria-hidden="true" />
                      <span className="docked-composer__mono">{plan.branch}</span>
                    </>
                  )}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      <input
        ref={titleRef}
        className="docked-composer__field changes-quick-commit__summary"
        type="text"
        value={title}
        disabled={isBusy}
        placeholder={t.saveVersionTitlePlaceholder}
        aria-label={t.saveVersionTitleLabel}
        onChange={(event) => {
          setTitle(event.target.value);
          clearStaleStatus();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void handleSave();
          }
        }}
      />
      <div className="docked-composer__extra">
        <div>
          {/* Grows with what is written, up to the CSS `max-height` (about
              eight lines), then scrolls: room for a long message without a
              second, bigger frame to write it in. */}
          <textarea
            {...autoHideScrollbarProps<HTMLTextAreaElement>()}
            ref={descriptionRef}
            className="changes-quick-commit__desc auto-hide-scrollbar"
            rows={2}
            value={description}
            disabled={isBusy}
            placeholder={t.saveVersionDescriptionPlaceholder}
            aria-label={t.saveVersionDescriptionLabel}
            onChange={(event) => {
              setDescription(event.target.value);
              clearStaleStatus();
            }}
          />
          {notes.length > 0 && (
            <div className="changes-quick-commit__notes">
              {notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          )}
          {(status === "save-error" || status === "blocked") && (
            <>
              <p className="docked-composer__error" role="alert">
                <CircleAlert aria-hidden="true" />
                {localizeAppError(state.error, t, t.errorGitCommandFailed)}
              </p>
              {/* What Git said, the same toggle the dialog prints: a hook's
                  output is the only thing that says what to fix, so a hook
                  rejection opens it. Keyed by the kind of failure because
                  `startExpanded` only seeds the first render. */}
              <FailureDetail
                key={wasRejectedByHook ? "hook" : "generic"}
                error={state.error}
                t={t}
                startExpanded={wasRejectedByHook}
              />
            </>
          )}
          {wasRejectedByHook && (
            <button
              className="secondary-button secondary-button--sm changes-quick-commit__hook-escape"
              type="button"
              onClick={() => void handleSave(false)}
            >
              {t.saveVersionSkipHooks}
            </button>
          )}
        </div>
      </div>
      <div className="docked-composer__foot">
        {isSaved && !publishToo ? (
          /* The step after a save, where "Also publish" stood: that option
             is spent for this version, and publishing it is what is left to
             do. A secondary button at the row tier, level with Save — not a
             second primary, since the band's Publish tile says that step in
             full. Absent when "Also publish" already took the reader there;
             the next keystroke clears the saved state and brings the option
             back. */
          <button
            type="button"
            className="secondary-button secondary-button--sm changes-quick-commit__publish-now"
            onClick={onPublishNow}
          >
            <CloudUpload aria-hidden="true" />
            {t.saveVersionPublishNow}
          </button>
        ) : (
          /* An option of this save, not a setting that takes effect on its
             own, so a checkbox rather than a switch; the button beside it
             says the consequence. */
          <label className="docked-composer__option" data-tooltip={remoteLabel ?? undefined}>
            <input
              className="app-checkbox"
              type="checkbox"
              checked={publishToo}
              disabled={isBusy}
              onChange={togglePublishToo}
            />
            <span>{t.saveVersionPublishToggleLabel}</span>
          </label>
        )}
        <button
          className="primary-button primary-button--sm docked-composer__action"
          type="button"
          disabled={!canSave || !title.trim() || isBusy}
          data-tooltip={!canSave ? t.changesSaveVersionNoSelectionHint : undefined}
          onClick={() => void handleSave()}
        >
          {isBusy ? (
            <>
              <LoaderCircle aria-hidden="true" className="icon--spinning" />
              {/* The short form: the dialog's "Saving your version…" is
                  wider than this row and pushed the button onto a line of
                  its own mid-save. The spinner and the disabled fields
                  already say what is happening. */}
              {t.changesQuickCommitSaving}
            </>
          ) : publishToo ? (
            t.saveVersionConfirmAndPublish
          ) : (
            t.saveVersionConfirm
          )}
        </button>
      </div>
    </div>
  );
}
