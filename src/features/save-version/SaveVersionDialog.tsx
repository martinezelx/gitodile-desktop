import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, CloudUpload, GitBranch, LoaderCircle, Plus, Save } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { Dialog, DialogBanner, LoadingPlaceholder, TextPlaceholder, autoHideScrollbarProps, useModalFocus } from "../../shared/ui";
import { usePersistedInstallDraft } from "../../runtime/drafts";
import { getSaveVersionBreakdown, type SaveVersionPreview } from "./domain";
import type { ChangeCategory } from "../status";
import type { SaveVersionController } from "./controller";
import { createSaveVersionController } from "./controller";
import { saveVersionPort } from "./tauriAdapter";
import { FailureDetail } from "./FailureDetail";
import { getSaveVersionNotes } from "./planNotes";
import { useSaveVersionFlow, type SaveVersionPhase } from "./useSaveVersionFlow";

const defaultController = createSaveVersionController(saveVersionPort);

/** The keycap the shortcut hint names. The same user-agent guess the titlebar
 * makes (`IS_MAC` in `src/app/branding.tsx`), which a feature cannot import. */
const MODIFIER_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

type VersionMessageDraft = { title: string; details: string };
const EMPTY_VERSION_MESSAGE: VersionMessageDraft = { title: "", details: "" };
const isEmptyVersionMessage = (draft: VersionMessageDraft): boolean =>
  draft.title === "" && draft.details === "";
const isVersionMessage = (value: unknown): value is VersionMessageDraft =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Partial<VersionMessageDraft>).title === "string" &&
  typeof (value as Partial<VersionMessageDraft>).details === "string";

const BREAKDOWN_LABEL_KEYS = {
  changed: "statusCategoryChanged",
  new: "statusCategoryNew",
  deleted: "statusCategoryDeleted",
  renamed: "statusCategoryRenamed",
  conflicted: "statusCategoryConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

function PlanSummary({ plan, t }: { plan: SaveVersionPreview; t: Translations }): React.JSX.Element {
  const breakdown = getSaveVersionBreakdown(plan.counts);
  const [showFiles, setShowFiles] = useState(false);
  // The same lines, in the same order, the quick commit box prints under its
  // plan — one list in `planNotes.ts` for both frames. The one that asks for
  // action (no line to land on) is a banner rather than a note.
  const notes = getSaveVersionNotes(plan, t).filter((note) => note !== t.saveVersionNoDestinationNote);
  const moreFiles = plan.totalFiles - plan.files.length;
  return (
    <>
      {/* Where this version lands and how much of it, from the plan that will
          write it — the same read that produced the state token, so the line
          and the save cannot disagree. One voice for the numbers: the count
          is the headline and the breakdown reads after it as text, so the
          line is a sentence rather than three kinds of mark side by side. A
          detached `HEAD` names no line rather than guessing one. */}
      <div className="save-version-summary">
        <div className="save-version-summary__head">
          <strong>{t.saveVersionFilesCount(plan.totalFiles)}</strong>
          {breakdown.length > 0 && (
            <ul className="save-version-breakdown" aria-label={t.statusBreakdownLabel}>
              {breakdown.map((item) => (
                <li key={item.category} className={`save-version-breakdown__item save-version-breakdown__item--${item.category}`}>
                  {t[BREAKDOWN_LABEL_KEYS[item.category]](item.count)}
                </li>
              ))}
            </ul>
          )}
          {/* What goes in is what reassures most, so it is one click away and
              never in the way: folded until asked for. */}
          {plan.files.length > 0 && (
            <button
              className="app-dialog__link save-version-summary__toggle"
              type="button"
              aria-expanded={showFiles}
              aria-controls="save-version-files"
              onClick={() => setShowFiles((shown) => !shown)}
            >
              {showFiles ? t.saveVersionHideFiles : t.saveVersionShowFiles}
              <ChevronDown aria-hidden="true" />
            </button>
          )}
        </div>
        {plan.branch && (
          // Its own quieter line, so a long name shortens with an ellipsis
          // (and says itself in full on hover) instead of pushing the count
          // and the breakdown about.
          <p className="save-version-branch" data-tooltip={plan.branch}>
            <GitBranch aria-hidden="true" />
            <span>{plan.branch}</span>
          </p>
        )}
        {showFiles && (
          // Bounded by the plan (`SAVE_PLAN_FILE_LIMIT`), so a plain list:
          // the Changes screen is the place for all of them.
          <div id="save-version-files" className="save-version-files auto-hide-scrollbar" {...autoHideScrollbarProps<HTMLDivElement>()}>
            <ul aria-label={t.saveVersionFilesListLabel}>
              {plan.files.map((file) => (
                <li key={file.path}>
                  <span className={`save-version-files__kind save-version-files__kind--${file.category}`}>
                    {t.saveVersionFileKind[file.category]}
                  </span>
                  <span className="save-version-files__path" data-tooltip={file.path}>
                    {file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
                  </span>
                </li>
              ))}
            </ul>
            {moreFiles > 0 && <p className="save-version-files__more">{t.saveVersionMoreFiles(moreFiles)}</p>}
          </div>
        )}
      </div>
      {notes.map((note) => (
        <p key={note} className="app-dialog__text">{note}</p>
      ))}
      {!plan.branch && (
        <DialogBanner tone="warning" icon={<GitBranch />}>
          <p>{t.saveVersionNoDestinationNote}</p>
        </DialogBanner>
      )}
    </>
  );
}

/** Stands in for `PlanSummary` while the plan is read, in the same places: the
 * count with its breakdown, and the line under it. The dialog opens in its
 * final shape with the fields and both buttons already there, so the answer
 * fills a space that was waiting for it. Only the shape is drawn — no number
 * or name is guessed before Git has answered. */
function PlanSummaryPlaceholder({ t }: { t: Translations }): React.JSX.Element {
  return (
    <LoadingPlaceholder label={t.saveVersionLoadingTitle}>
      <div className="save-version-summary">
        <div className="save-version-summary__head">
          <strong>
            <TextPlaceholder width="5em" />
          </strong>
          <span className="save-version-breakdown">
            <TextPlaceholder width="9em" />
          </span>
        </div>
        <p className="save-version-branch">
          <TextPlaceholder width="10em" />
        </p>
      </div>
    </LoadingPlaceholder>
  );
}

export function SaveVersionDialog({
  isOpen,
  controller = defaultController,
  projectPath,
  sessionEpoch,
  selectedPaths,
  preview = null,
  runHooks,
  onClose,
  onSaved,
  onPublishNow,
  onPhaseChange,
}: {
  isOpen: boolean;
  controller?: SaveVersionController;
  projectPath: string;
  sessionEpoch: string;
  selectedPaths: string[] | null;
  /** What the session already knows of the plan (`previewFromWorkingTree`),
   * drawn while Git answers so the dialog opens in its final shape. Save is
   * held back as "Checking…" until the fresh plan replaces it; only that plan
   * is ever saved. */
  preview?: SaveVersionPreview | null;
  /** The Settings switch, passed in rather than read here: this feature owns
   * the save request, not the app's preferences. */
  runHooks: boolean;
  onClose: () => void;
  onSaved: () => void;
  onPublishNow: () => void;
  onPhaseChange?: (phase: SaveVersionPhase) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLTextAreaElement>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Snapshots `selectedPaths` at the moment the dialog opens (the false →
  // true transition, adjusted during render — not an effect, so it can't
  // itself trigger an extra render). The underlying file list is inert
  // while this modal is open, so the prop shouldn't legitimately change
  // again until it closes — but a background status refresh (the one
  // `onSaved` triggers right after a successful save is the case that
  // actually bit us) recomputes an equivalent selection as a *new array
  // reference*, and reacting to that reference change as if the user had
  // changed their mind mid-dialog would re-fetch the plan and silently
  // overwrite the success screen that was just shown.
  const previousIsOpenRef = useRef(false);
  const selectedPathsRef = useRef(selectedPaths);
  if (isOpen && !previousIsOpenRef.current) {
    selectedPathsRef.current = selectedPaths;
  }
  previousIsOpenRef.current = isOpen;
  const [messageDraft, setMessageDraft, clearMessageDraft] = usePersistedInstallDraft(
    `save-version-dialog:${projectPath}`,
    "version message",
    EMPTY_VERSION_MESSAGE,
    isEmptyVersionMessage,
    isVersionMessage,
  );
  const { title, details } = messageDraft;
  const setTitle = (value: string): void =>
    setMessageDraft((current) => ({ ...current, title: value }));
  const setDetails = (value: string): void =>
    setMessageDraft((current) => ({ ...current, details: value }));
  const [showTitleError, setShowTitleError] = useState(false);
  // The details field is folded behind "Add details" so the name is the one
  // field the dialog asks for. A draft with details opens it unfolded: text
  // someone wrote is never hidden behind a link.
  const [detailsOpened, setDetailsOpened] = useState(false);
  const showDetails = detailsOpened || details !== "";
  // The flow itself — plan, save, failure classification, the "also
  // publish" preference — is shared with Changes' quick commit box; this
  // component owns only the modal around it.
  const {
    state,
    plan,
    isBusy,
    wasRejectedByHook,
    publishToo,
    togglePublishToo,
    loadPlan,
    save,
    cancel,
  } = useSaveVersionFlow({
    controller,
    projectPath,
    sessionEpoch,
    onSaved,
    // Same handoff as clicking "Publish now" on the success screen below,
    // just without waiting for that extra click.
    onPublishNow: () => {
      onClose();
      onPublishNow();
    },
    onPhaseChange,
  });

  // `useModalFocus` only ever calls this with the literal `false` (Escape),
  // but it must still satisfy `Dispatch<SetStateAction<boolean>>`. Reading
  // `onClose` through a ref keeps this callback's identity stable across
  // renders — otherwise every keystroke in the textarea (which re-renders
  // this component) would recreate it, and `useModalFocus`'s effect would
  // tear down and reinstall its keydown listener and re-steal focus on
  // every render while the dialog is open.
  const onCloseRef = useRef(onClose);
  const isBusyRef = useRef(false);
  onCloseRef.current = onClose;
  const setOpenState = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? (next as (previous: boolean) => boolean)(true) : next;
    if (!value && !isBusyRef.current) {
      onCloseRef.current();
    }
  }, []);
  useModalFocus(isOpen, dialogRef, setOpenState);

  // Only the validation flag resets on open. `title`/`details` deliberately
  // do not: closing this dialog without saving — a backdrop click, Escape, a
  // stray click on Cancel — used to throw away whatever was typed with no
  // confirmation, and reopening it for the same change should find the draft
  // still there. It's cleared explicitly once a save actually succeeds,
  // below, instead of implicitly here on every open.
  useEffect(() => {
    if (isOpen) {
      setShowTitleError(false);
      setDetailsOpened(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    void loadPlan(selectedPathsRef.current);
    // Closing forgets the plan in flight, so a dialog that closed while Git
    // was still answering never repaints itself with that answer.
    return cancel;
    // Deliberately not depending on `selectedPaths`: see `selectedPathsRef`
    // above. Re-running this effect must only ever be triggered by the
    // dialog actually (re)opening or a manual retry, never by a live prop
    // reference change while it's already open.
  }, [cancel, isOpen, loadPlan, retryToken]);

  // The form is there from the first frame, so the name is focused as soon as
  // the dialog opens (and again when a retry brings the form back after a
  // blocked plan) — typing does not wait for Git. It is not refocused when the
  // plan lands: by then the reader may already be somewhere else in the form.
  const showsForm = isOpen && state.status !== "blocked" && state.status !== "success";
  useEffect(() => {
    if (!showsForm) {
      return undefined;
    }
    const animationFrame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(animationFrame);
  }, [showsForm]);

  useEffect(() => {
    if (!isOpen || state.status !== "success") {
      return undefined;
    }
    const animationFrame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen, state.status]);

  if (!isOpen) {
    return null;
  }

  // Until the first plan arrives the flow is `idle` (the open effect has not
  // run yet) or `planning`; either way the summary is the preview's, or a
  // placeholder where it will be, and Save waits for the plan that decides.
  const isChecking = state.status === "idle" || state.status === "planning";
  const summary: SaveVersionPreview | null = plan ?? (isChecking ? preview : null);
  const isFirstVersion = summary?.isFirstVersion ?? false;
  const showLengthHint = title.trim().length > 50;
  isBusyRef.current = isBusy;

  /* `attemptHooks` defaults to the preference. It is only ever passed as
     `false`, by the escape offered after a hook rejection, and that stays a
     one-time choice: nothing here writes the preference back. */
  function handleConfirm(attemptHooks: boolean = runHooks): void {
    // The keyboard reaches this without the button, so it checks what the
    // button's `disabled` does: only a confirmed plan, and never twice.
    if (!plan || isBusy || isChecking) {
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setShowTitleError(true);
      titleRef.current?.focus();
      return;
    }
    const trimmedDetails = details.trim();
    void save({
      plan,
      title: trimmedTitle,
      description: trimmedDetails ? trimmedDetails : null,
      selectedPaths: selectedPathsRef.current,
      runHooks: attemptHooks,
    }).then((saved) => {
      // The draft this saved, cleared now that it's the version's own
      // record rather than still-editable text — see the open-effect above
      // for why it otherwise survives a close.
      if (saved) clearMessageDraft();
    });
  }

  // Enter in the name saves, as it does in the quick commit box; Ctrl/⌘+Enter
  // saves from anywhere in the form, the details included.
  function handleShortcut(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }
    const isInName = event.currentTarget === titleRef.current;
    if ((isInName && !event.shiftKey) || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      handleConfirm();
    }
  }

  function openDetails(): void {
    setDetailsOpened(true);
    window.requestAnimationFrame(() => detailsRef.current?.focus());
  }

  const isNothingToSave = state.status === "blocked" && isAppError(state.error) && state.error.code === "nothing_to_save";
  const titleText = state.status === "success"
    ? t.saveVersionSuccessTitle
    : isFirstVersion
      ? t.saveVersionDialogTitleFirst
      : t.saveVersionDialogTitle;

  return (
    <Dialog
      size="m"
      title={titleText}
      titleId="save-version-title"
      titleRef={headingRef}
      icon={state.status === "success" ? <Check /> : undefined}
      tone="success"
      onClose={onClose}
      closeLabel={t.commonClose}
      dismissible={!isBusy}
      dialogRef={dialogRef}
      className="auto-hide-scrollbar"
      bodyProps={autoHideScrollbarProps<HTMLDivElement>()}
    >
      {state.status === "blocked" && (
        <>
          <p className="app-dialog__text" role="alert">
            {localizeAppError(state.error, t, t.errorGitCommandFailed)}
          </p>
          <div className="dialog-actions">
            {/* Retrying can't make changes appear: "nothing to save" only
                offers the way out. Any other planning failure may pass. */}
            {isNothingToSave ? (
              <button className="primary-button" type="button" onClick={onClose}>
                {t.commonClose}
              </button>
            ) : (
              <>
                <button className="secondary-button" type="button" onClick={onClose}>
                  {t.commonCancel}
                </button>
                <button className="primary-button" type="button" onClick={() => setRetryToken((token) => token + 1)}>
                  {t.saveVersionRetry}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {showsForm && (
        <>
          {/* Mounted for as long as the form is, so the change of its text is
              what gets announced: a live region inserted with its words
              already in it is often read by nobody. Only with a preview —
              without one, the placeholder announces itself. */}
          <span className="visually-hidden" role="status">
            {isChecking && summary ? t.saveVersionChecking : ""}
          </span>
          {summary ? <PlanSummary plan={summary} t={t} /> : <PlanSummaryPlaceholder t={t} />}

          <label className="text-field save-version-title">
            <span>{t.saveVersionTitleLabel}</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              required
              disabled={isBusy}
              aria-invalid={showTitleError || undefined}
              aria-describedby={
                [showLengthHint ? "save-version-title-guidance" : "", showTitleError ? "save-version-title-error" : ""]
                  .filter(Boolean).join(" ") || undefined
              }
              onChange={(event) => {
                setTitle(event.target.value);
                if (showTitleError) {
                  setShowTitleError(false);
                }
              }}
              onKeyDown={handleShortcut}
              placeholder={t.saveVersionTitlePlaceholder}
            />
          </label>
          {/* Only once the name runs long: a hint that is always there is a
              line of grey nobody asked for. */}
          {showLengthHint && (
            <span id="save-version-title-guidance" className="save-version-title__guidance">
              {t.saveVersionTitleGuidance}
            </span>
          )}
          {showTitleError && (
            // A sibling of the <label>, not a child: text-library's implicit
            // label lookup matches on the label's full text content, so
            // nesting this here would make "Version name" stop resolving to
            // the input once the error appears.
            <span id="save-version-title-error" className="save-version-title__error" role="alert">
              {t.errorEmptyTitle}
            </span>
          )}

          {showDetails ? (
            <label className="text-field save-version-description">
              <span>{t.saveVersionDescriptionLabel}</span>
              <textarea
                {...autoHideScrollbarProps<HTMLTextAreaElement>()}
                ref={detailsRef}
                className="auto-hide-scrollbar"
                rows={3}
                value={details}
                disabled={isBusy}
                onChange={(event) => {
                  // Held open once edited, so clearing a drafted text does
                  // not fold the field away under the cursor.
                  setDetailsOpened(true);
                  setDetails(event.target.value);
                }}
                onKeyDown={handleShortcut}
                placeholder={t.saveVersionDescriptionPlaceholder}
              />
            </label>
          ) : (
            <button
              className="app-dialog__link save-version-add-details"
              type="button"
              onClick={openDetails}
              disabled={isBusy}
            >
              <Plus aria-hidden="true" />
              {t.saveVersionAddDetails}
            </button>
          )}

          {/* A choice for this save, not a setting: a checkbox, not a switch. */}
          <label className="app-dialog__check">
            <input
              type="checkbox"
              className="app-checkbox"
              checked={publishToo}
              disabled={isBusy}
              onChange={togglePublishToo}
              aria-describedby="save-version-publish-note"
            />
            <span>
              {t.saveVersionPublishAfterLabel}
              {/* What the choice means, where the choice is: on this computer
                  only, or a publish to review next. Publish still shows its
                  own plan and asks its own confirmation. Hidden from the
                  label's name, and read as the checkbox's description. */}
              <small id="save-version-publish-note" aria-hidden="true">
                {publishToo ? t.saveVersionPublishNextNote : t.saveVersionLocalOnlyNote}
              </small>
            </span>
          </label>

          {state.status === "save-error" && (
            <DialogBanner tone="danger" icon={<CircleAlert />}>
              <p role="alert">{localizeAppError(state.error, t, t.errorGitCommandFailed)}</p>
              {/* Keyed by the kind of failure: `startExpanded` only seeds the
                  initial state, so without this a hook rejection that followed
                  a signing failure would inherit the collapsed toggle and hide
                  the only message that says what to fix. */}
              <FailureDetail
                key={wasRejectedByHook ? "hook" : "generic"}
                error={state.error}
                t={t}
                startExpanded={wasRejectedByHook}
              />
              {/* With the failure rather than in the action row: the hook's
                  output is the reason this way past it exists, and it is a
                  one-time choice that never writes the preference back. */}
              {wasRejectedByHook && (
                <button
                  className="app-dialog__link"
                  type="button"
                  onClick={() => handleConfirm(false)}
                  disabled={isBusy}
                >
                  {t.saveVersionSkipHooks}
                </button>
              )}
            </DialogBanner>
          )}

          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={isBusy}>
              {t.commonCancel}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => handleConfirm()}
              disabled={isBusy || isChecking || !plan}
              // A tooltip rather than a keycap inside the label: the label
              // already has to fit beside Cancel in every language.
              data-tooltip={t.saveVersionShortcutHint(MODIFIER_KEY)}
              aria-keyshortcuts="Control+Enter Meta+Enter"
            >
              {isBusy || isChecking ? (
                <>
                  <LoaderCircle aria-hidden="true" className="icon--spinning" />
                  {isChecking ? t.saveVersionChecking : t.saveVersionSaving}
                </>
              ) : (
                <>
                  <Save aria-hidden="true" />
                  {publishToo ? t.saveVersionConfirmAndPublish : t.saveVersionConfirm}
                </>
              )}
            </button>
          </div>
        </>
      )}

      {state.status === "success" && (
        <>
          <div role="status" aria-live="polite" className="save-version-success">
            <p className="app-dialog__text">{t.saveVersionSavedOn(state.result.title, state.result.branch)}</p>
            {state.result.description && (
              <p className="save-version-success-details">{state.result.description}</p>
            )}
          </div>
          {/* Publishing is the constructive next step, so it is the primary;
              Done just closes. */}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              {t.saveVersionDone}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                onClose();
                onPublishNow();
              }}
            >
              <CloudUpload aria-hidden="true" />
              {t.saveVersionPublishNow}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
