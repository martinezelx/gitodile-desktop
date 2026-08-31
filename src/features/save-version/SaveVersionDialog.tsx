import React, { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Save, Send } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { localizeAppError, isAppError } from "../../shared/i18n";
import { useModalFocus } from "../../shared/ui";
import { autoHideScrollbarProps } from "../../shared/ui";
import { getSaveVersionBreakdown, type SaveVersionPlan, type SaveVersionResult } from "./domain";
import type { ChangeCategory } from "../status";
import type { SaveVersionController } from "./controller";
import { createSaveVersionController } from "./controller";
import { saveVersionPort } from "./tauriAdapter";

const defaultController = createSaveVersionController(saveVersionPort);

const BREAKDOWN_LABEL_KEYS = {
  changed: "statusCategoryChanged",
  new: "statusCategoryNew",
  deleted: "statusCategoryDeleted",
  renamed: "statusCategoryRenamed",
  conflicted: "statusCategoryConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

type DialogState =
  | { status: "loading" }
  | { status: "blocked"; error: unknown }
  | { status: "ready"; plan: SaveVersionPlan }
  | { status: "submitting"; plan: SaveVersionPlan }
  /** `ranHooks` records the attempt, not the preference: the offer to retry
   * without hooks is only honest when a hook actually ran, and the preference
   * can be read at any time while this state is on screen. */
  | { status: "save-error"; plan: SaveVersionPlan; error: unknown; ranHooks: boolean }
  | { status: "success"; result: SaveVersionResult };

function PlanSummary({ plan, t }: { plan: SaveVersionPlan; t: Translations }): React.JSX.Element {
  const breakdown = getSaveVersionBreakdown(plan.counts);
  return (
    <div className="save-version-summary">
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
      {plan.remainingFiles > 0 && <p className="save-version-note">{t.saveVersionRemainingNote(plan.remainingFiles)}</p>}
      {plan.hasPreparedChanges && <p className="save-version-note">{t.saveVersionPreparedNote}</p>}
      {plan.isFirstVersion && <p className="save-version-note">{t.saveVersionFirstVersionNote}</p>}
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
  onPhaseChange?: (phase: "planning" | "executing" | "error" | "success") => void;
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
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [showTitleError, setShowTitleError] = useState(false);
  const [state, setState] = useState<DialogState>({ status: "loading" });

  // `useModalFocus` only ever calls this with the literal `false` (Escape),
  // but it must still satisfy `Dispatch<SetStateAction<boolean>>`. Reading
  // `onClose` through a ref keeps this callback's identity stable across
  // renders — otherwise every keystroke in the textarea (which re-renders
  // this component) would recreate it, and `useModalFocus`'s effect would
  // tear down and reinstall its keydown listener and re-steal focus on
  // every render while the dialog is open.
  const onCloseRef = useRef(onClose);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const isBusyRef = useRef(false);
  onCloseRef.current = onClose;
  onPhaseChangeRef.current = onPhaseChange;
  const setOpenState = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? (next as (previous: boolean) => boolean)(true) : next;
    if (!value && !isBusyRef.current) {
      onCloseRef.current();
    }
  }, []);
  useModalFocus(isOpen, dialogRef, setOpenState);

  // Resets per-open input state; separate from the plan-fetching effect below
  // so a "Try again" retry (which bumps `retryToken`) never wipes what the
  // user already typed.
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDetails("");
      setShowTitleError(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    onPhaseChangeRef.current?.("planning");
    setState({ status: "loading" });
    controller.plan({ projectId: projectPath, sessionEpoch, selectedPaths: selectedPathsRef.current })
      .then((plan) => {
        if (!cancelled) {
          setState({ status: "ready", plan });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "blocked", error });
        }
      });
    return () => {
      cancelled = true;
    };
    // Deliberately not depending on `selectedPaths`: see `selectedPathsRef`
    // above. Re-running this effect must only ever be triggered by the
    // dialog actually (re)opening or a manual retry, never by a live prop
    // reference change while it's already open.
  }, [controller, isOpen, projectPath, retryToken, sessionEpoch]);

  useEffect(() => {
    if (!isOpen || state.status === "loading") {
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
  const isFirstVersion = plan?.isFirstVersion ?? false;
  const isBusy = state.status === "submitting";
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
    setState({ status: "submitting", plan });
    onPhaseChangeRef.current?.("executing");
    controller.save({
      projectId: projectPath,
      sessionEpoch,
      title: trimmedTitle,
      description: trimmedDetails ? trimmedDetails : null,
      stateToken: plan.stateToken,
      selectedPaths: selectedPathsRef.current,
      runHooks: attemptHooks,
    })
      .then((result) => {
        setState({ status: "success", result });
        onPhaseChangeRef.current?.("success");
        onSaved();
      })
      .catch((error: unknown) => {
        setState({ status: "save-error", plan, error, ranHooks: attemptHooks });
        onPhaseChangeRef.current?.("error");
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

        {state.status === "loading" && (
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
                    {t.saveVersionConfirm}
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
