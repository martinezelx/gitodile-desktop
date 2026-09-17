import React, { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Save, Send } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { localizeAppError, isAppError } from "../../shared/i18n";
import { useModalFocus } from "../../shared/ui";
import { autoHideScrollbarProps } from "../../shared/ui";
import { usePersistedInstallDraft } from "../../runtime/drafts";
import { getSaveVersionBreakdown, type SaveVersionPlan } from "./domain";
import type { ChangeCategory } from "../status";
import type { SaveVersionController } from "./controller";
import { createSaveVersionController } from "./controller";
import { saveVersionPort } from "./tauriAdapter";
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
  return (
    <div className="save-version-summary">
      {/* Where this version lands, from the plan that will write it — the same
          read that produced the state token, so the sentence and the save
          cannot disagree. A plan with no line to name says nothing here rather
          than guessing one: a detached `HEAD` is not a line, and inventing a
          name would be the one thing a destination must never do. */}
      {plan.branch && <p className="save-version-destination">{t.saveVersionDestination(plan.branch)}</p>}
      <p>{t.saveVersionFilesSummary(plan.totalFiles)}</p>
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
      {/* The same lines, in the same order, the quick commit box prints
          under its plan — one list in `planNotes.ts` for both frames. */}
      {getSaveVersionNotes(plan, t).map((note) => (
        <p key={note} className="save-version-note">{note}</p>
      ))}
      <p className="save-version-note">{t.saveVersionLocalOnlyNote}</p>
    </div>
  );
}

function FailureDetail({
  error,
  t,
  startExpanded = false,
}: {
  error: unknown;
  t: Translations;
  /** A hook rejection opens its own output: the hook's message *is* the
   * explanation, and hiding the only thing that says what to fix behind a
   * toggle makes the failure look arbitrary. */
  startExpanded?: boolean;
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(startExpanded);
  if (!isAppError(error) || !error.detail) {
    return null;
  }
  return (
    <div className="save-version-detail">
      <button type="button" className="save-version-detail__toggle" onClick={() => setExpanded((value) => !value)}>
        {expanded ? t.saveVersionHideDetail : t.saveVersionShowDetail}
      </button>
      {expanded && (
        <div>
          <p className="save-version-detail__heading">{t.saveVersionDetailHeading}</p>
          <pre
            {...autoHideScrollbarProps<HTMLPreElement>()}
            className="save-version-detail__body auto-hide-scrollbar"
          >
            {error.detail}
          </pre>
        </div>
      )}
    </div>
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
  isBusyRef.current = isBusy;

  function requestClose(): void {
    if (!isBusy) {
      onClose();
    }
  }

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

  return (
    <div className="save-version-backdrop" role="presentation" onMouseDown={requestClose}>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        ref={dialogRef}
        className="save-version-dialog auto-hide-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-version-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2
          ref={headingRef}
          id="save-version-title"
          tabIndex={state.status === "success" ? -1 : undefined}
        >
          {state.status === "success"
            ? t.saveVersionSuccessTitle
            : isFirstVersion
              ? t.saveVersionDialogTitleFirst
              : t.saveVersionDialogTitle}
        </h2>

        {state.status === "planning" && (
          <div className="save-version-status" role="status">
            <LoaderCircle aria-hidden="true" className="icon--spinning" />
            <p>{t.saveVersionLoadingTitle}</p>
          </div>
        )}

        {state.status === "blocked" && (
          <>
            <p className="save-version-error" role="alert">
              <CircleAlert aria-hidden="true" />
              {localizeAppError(state.error, t, t.errorGitCommandFailed)}
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={onClose}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="button" onClick={() => setRetryToken((token) => token + 1)}>
                {t.saveVersionRetry}
              </button>
            </div>
          </>
        )}

        {plan && state.status !== "success" && (
          <>
            <PlanSummary plan={plan} t={t} />

            {state.status === "save-error" && (
              <div>
                <p className="save-version-error" role="alert">
                  <CircleAlert aria-hidden="true" />
                  {localizeAppError(state.error, t, t.errorGitCommandFailed)}
                </p>
                {/* Keyed by the kind of failure: `startExpanded` only seeds
                    the initial state, so without this a hook rejection that
                    followed a signing failure would inherit the collapsed
                    toggle and hide the only message that says what to fix. */}
                <FailureDetail
                  key={wasRejectedByHook ? "hook" : "generic"}
                  error={state.error}
                  t={t}
                  startExpanded={wasRejectedByHook}
                />
                {/* Sits with the failure rather than in the action row below:
                    the hook's output is the reason this button exists, and the
                    row has 424px for two buttons, not three. The note is
                    visible text, not a `title` — it is the part that says this
                    changes nothing beyond this save. */}
                {wasRejectedByHook && (
                  <div className="save-version-hook-escape">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => handleConfirm(false)}
                      disabled={isBusy}
                    >
                      {t.saveVersionSkipHooks}
                    </button>
                    <p className="save-version-note">{t.saveVersionSkipHooksNote}</p>
                  </div>
                )}
              </div>
            )}

            <label className="text-field save-version-title">
              <span>{t.saveVersionTitleLabel}</span>
              <input
                ref={titleRef}
                type="text"
                value={title}
                required
                disabled={isBusy}
                aria-describedby={
                  showTitleError
                    ? "save-version-title-guidance save-version-title-error"
                    : "save-version-title-guidance"
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
            <span id="save-version-title-guidance" className="save-version-title__guidance">
              {t.saveVersionTitleGuidance}
            </span>
            {showTitleError && (
              // A sibling of the <label>, not a child: text-library's
              // implicit label lookup matches on the label's full text
              // content, so nesting this here would make "Version name"
              // stop resolving to the input once the error appears.
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

            <div className="settings-row">
              <div>
                <strong>{t.saveVersionPublishToggleLabel}</strong>
                <p>{t.saveVersionPublishToggleHint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={publishToo}
                aria-label={t.saveVersionPublishToggleLabel}
                className={`toggle-switch${publishToo ? " toggle-switch--on" : ""}`}
                disabled={isBusy}
                onClick={togglePublishToo}
              >
                <span className="toggle-switch__knob" />
              </button>
            </div>

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
              <p>{t.saveVersionSuccessDescription(state.result.title, state.result.shortCommit)}</p>
              {state.result.description && (
                <p className="save-version-success-details">{state.result.description}</p>
              )}
              <p className="save-version-note">{t.saveVersionSuccessLocalNote}</p>
            </div>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  onClose();
                  onPublishNow();
                }}
              >
                <Send aria-hidden="true" />
                {t.saveVersionPublishNow}
              </button>
              <button className="primary-button" type="button" onClick={onClose}>
                {t.saveVersionDone}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
