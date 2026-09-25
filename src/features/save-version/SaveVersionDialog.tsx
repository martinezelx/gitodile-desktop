import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, CloudUpload, GitBranch, Laptop, LoaderCircle, Save } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { Dialog, DialogBanner, autoHideScrollbarProps, useModalFocus } from "../../shared/ui";
import { usePersistedInstallDraft } from "../../runtime/drafts";
import { getSaveVersionBreakdown, type SaveVersionPlan } from "./domain";
import type { ChangeCategory } from "../status";
import type { SaveVersionController } from "./controller";
import { createSaveVersionController } from "./controller";
import { saveVersionPort } from "./tauriAdapter";
import { FailureDetail } from "./FailureDetail";
import { getSaveVersionNotes } from "./planNotes";
import { useSaveVersionFlow, type SaveVersionPhase } from "./useSaveVersionFlow";

const defaultController = createSaveVersionController(saveVersionPort);

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

function PlanSummary({ plan, t }: { plan: SaveVersionPlan; t: Translations }): React.JSX.Element {
  const breakdown = getSaveVersionBreakdown(plan.counts);
  // The same lines, in the same order, the quick commit box prints under its
  // plan — one list in `planNotes.ts` for both frames. The one that asks for
  // action (no line to land on) is a banner rather than a note.
  const notes = getSaveVersionNotes(plan, t).filter((note) => note !== t.saveVersionNoDestinationNote);
  return (
    <>
      {/* Where this version lands and how much of it, from the plan that will
          write it — the same read that produced the state token, so the line
          and the save cannot disagree. A detached `HEAD` names no line rather
          than guessing one. */}
      <div className="app-dialog__summary">
        <strong>{t.saveVersionSummary(plan.totalFiles, plan.branch)}</strong>
        {breakdown.length > 0 && (
          <ul className="status-breakdown" aria-label={t.statusBreakdownLabel}>
            {breakdown.map((item) => (
              <li
                key={item.category}
                className={`status-breakdown__item${item.category === "conflicted" ? " status-breakdown__item--attention" : ""}`}
              >
                {t[BREAKDOWN_LABEL_KEYS[item.category]](item.count)}
              </li>
            ))}
          </ul>
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

export function SaveVersionDialog({
  isOpen,
  controller = defaultController,
  projectPath,
  sessionEpoch,
  selectedPaths,
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

  useEffect(() => {
    if (!isOpen || state.status === "planning" || state.status === "idle") {
      return undefined;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      if (state.status === "ready") {
        titleRef.current?.focus();
      } else if (state.status === "success") {
        headingRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen, state.status]);

  if (!isOpen) {
    return null;
  }

  const isFirstVersion = plan?.isFirstVersion ?? false;
  const showLengthHint = title.trim().length > 50;
  isBusyRef.current = isBusy;

  /* `attemptHooks` defaults to the preference. It is only ever passed as
     `false`, by the escape offered after a hook rejection, and that stays a
     one-time choice: nothing here writes the preference back. */
  function handleConfirm(attemptHooks: boolean = runHooks): void {
    if (!plan) {
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
      {state.status === "planning" && (
        <p className="app-dialog__note" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
          {t.saveVersionLoadingTitle}
        </p>
      )}

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

      {plan && state.status !== "success" && (
        <>
          <PlanSummary plan={plan} t={t} />

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

          <label className="text-field save-version-description">
            <span>{t.saveVersionDescriptionLabel}</span>
            <textarea
              {...autoHideScrollbarProps<HTMLTextAreaElement>()}
              className="auto-hide-scrollbar"
              rows={3}
              value={details}
              disabled={isBusy}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={t.saveVersionDescriptionPlaceholder}
            />
          </label>

          {/* A choice for this save, not a setting: a checkbox, not a switch. */}
          <label className="app-dialog__check">
            <input
              type="checkbox"
              className="app-checkbox"
              checked={publishToo}
              disabled={isBusy}
              onChange={togglePublishToo}
            />
            {t.saveVersionPublishAfterLabel}
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

          <div className="app-dialog__foot">
            <p className="app-dialog__note">
              <Laptop aria-hidden="true" />
              {t.saveVersionLocalOnlyNote}
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onClose} disabled={isBusy}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="button" onClick={() => handleConfirm()} disabled={isBusy}>
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {t.saveVersionSaving}
                  </>
                ) : (
                  <>
                    <Save aria-hidden="true" />
                    {publishToo ? t.saveVersionConfirmAndPublish : t.saveVersionDialogConfirm}
                  </>
                )}
              </button>
            </div>
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
