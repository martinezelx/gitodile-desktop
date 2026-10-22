import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, LoaderCircle, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import {
  autoHideScrollbarProps,
  Dialog,
  DialogFacts,
  InclusionNode,
  LoadingPlaceholder,
  StateGlyph,
  StateGlyphs,
  TextPlaceholder,
  useModalFocus,
  useToast,
} from "../../shared/ui";
import type {
  CleanUpBranch,
  CleanUpBranchesPlan,
  CleanUpBranchesResult,
  Branch,
  BranchesSnapshot,
} from "./domain";
import { rowGlyphs } from "./branchGlyphs";
import { branchesPort } from "./tauriAdapter";
import { ErrorBanner, branchName } from "./BranchesDialog";

/** The most branches one clean-up asks for. Rust keeps one recovery point per
 * deleted branch and refuses a clean-up longer than the points it keeps. */
export const MAX_CLEAN_UP_BRANCHES = 50;

type CleanUpState =
  | { status: "loading" }
  | { status: "blocked"; error: unknown }
  | { status: "ready"; plan: CleanUpBranchesPlan }
  | { status: "deleting"; plan: CleanUpBranchesPlan }
  | { status: "delete-error"; plan: CleanUpBranchesPlan; error: unknown }
  | { status: "done"; result: CleanUpBranchesResult };

/** Where the branch's work is kept, in a few words: the first ref that holds it,
 * and how many more do. */
function keptOn(branch: CleanUpBranch, t: Translations): string {
  return t.cleanUpBranchesKeptOn(branchName(branch.retainedBy[0] ?? ""), Math.max(0, branch.retainedBy.length - 1));
}

/** "Review" on Branches' Ready to clean up block: the block's branches in one
 * confirmed, destructive step. Every branch is checked again by Rust before it
 * goes, and keeps a recovery point with its name and tip; a branch that stopped
 * qualifying is skipped and reported, never a reason to stop the rest. */
export function CleanUpBranchesDialog({
  isOpen,
  projectPath,
  sessionEpoch,
  branches,
  onClose,
  onCleanedUp,
  onPhaseChange,
}: {
  isOpen: boolean;
  projectPath: string;
  sessionEpoch: string;
  /** The block's branches, in the order the list draws them. */
  branches: readonly Branch[];
  onClose: () => void;
  /** The fresh snapshot, handed over as soon as anything was deleted —
   * `null` when Rust could not read it afterwards, so the host refreshes. */
  onCleanedUp: (snapshot: BranchesSnapshot | null) => void;
  onPhaseChange?: (phase: "planning" | "executing" | "error" | "success") => void;
}): React.JSX.Element | null {
  const { t, formats } = useLanguage();
  const showToast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<CleanUpState>({ status: "loading" });
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  /* Off by default, unlike the single delete: a clean-up is many shared
     branches at once, and taking them off the remote for the whole team is
     the step to ask for rather than to opt out of. */
  const [deleteRemote, setDeleteRemote] = useState(false);
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

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

  /* The names asked for are fixed when the dialog opens: the list refreshing
     under an open preview must not re-plan it, any more than the single
     delete re-plans when its branch's row redraws. */
  const asked = useMemo(
    () => branches.slice(0, MAX_CLEAN_UP_BRANCHES).map((branch) => branch.name),
    [isOpen, retryToken],
  );
  const byName = useMemo(() => new Map(branches.map((branch) => [branch.name, branch])), [branches]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading" });
    setDeleteRemote(false);
    onPhaseChangeRef.current?.("planning");
    branchesPort
      .planCleanUp({ projectId: projectPath, sessionEpoch, names: asked })
      .then((plan) => {
        if (cancelled) return;
        setChosen(new Set(plan.branches.map((branch) => branch.name)));
        setState({ status: "ready", plan });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: "blocked", error });
        onPhaseChangeRef.current?.("error");
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectPath, sessionEpoch, asked]);

  if (!isOpen) {
    return null;
  }

  const isBusy = state.status === "deleting";
  isBusyRef.current = isBusy;

  function requestClose(): void {
    if (!isBusy) {
      onClose();
    }
  }

  const plan = "plan" in state ? state.plan : null;
  const chosenBranches = plan ? plan.branches.filter((branch) => chosen.has(branch.name)) : [];
  const publishedChosen = chosenBranches.filter((branch) => branch.published !== null).length;
  /* Fixed for the dialog's life, so the option and the facts never come and
     go as branches are ticked: the dialog keeps one size. */
  const anyPublished = plan !== null && plan.branches.some((branch) => branch.published !== null);

  function toggle(name: string, on: boolean): void {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function handleConfirm(): void {
    if (state.status !== "ready" && state.status !== "delete-error") return;
    const current = state.plan;
    const requested = current.branches.filter((branch) => chosen.has(branch.name));
    if (requested.length === 0) return;
    const remote = deleteRemote && requested.some((branch) => branch.published !== null);
    setState({ status: "deleting", plan: current });
    onPhaseChangeRef.current?.("executing");
    branchesPort
      .cleanUp({
        projectId: projectPath,
        sessionEpoch,
        branches: requested.map((branch) => ({ name: branch.name, stateToken: branch.stateToken })),
        deleteRemote: remote,
      })
      .then((result) => {
        onPhaseChangeRef.current?.("success");
        onCleanedUp(result.snapshot);
        const deleted = result.branches.filter((branch) => branch.outcome === "deleted");
        const clean =
          deleted.length === result.branches.length && deleted.every((branch) => branch.remoteError === null);
        if (clean) {
          // Nothing left to read: a toast, and the dialog goes.
          showToast({ icon: <Trash2 />, message: t.cleanUpBranchesToast(deleted.length, remote) });
          onCloseRef.current();
          return;
        }
        // Something was kept or is still published: that stays on screen
        // until it has been read.
        setState({ status: "done", result });
      })
      .catch((error: unknown) => {
        setState({ status: "delete-error", plan: current, error });
        onPhaseChangeRef.current?.("error");
      });
  }

  const allChosen = plan !== null && plan.branches.length > 0 && chosenBranches.length === plan.branches.length;
  const someChosen = chosenBranches.length > 0 && !allChosen;

  const branchGlyphs = (name: string): React.ReactNode => {
    const branch = byName.get(name);
    if (!branch) return null;
    const glyphs = rowGlyphs(branch, t, formats);
    if (glyphs.length === 0) return null;
    return (
      <StateGlyphs>
        {glyphs.map((glyph) => (
          <StateGlyph key={glyph.key} tone={glyph.tone} icon={glyph.icon} count={glyph.count} tooltip={glyph.tooltip} />
        ))}
      </StateGlyphs>
    );
  };

  /* DESIGN.md § Dialogs: a confirmation that removes work leads in danger,
     a block the reader cannot lift here in warning, a result in success. */
  const nothingToDelete = plan !== null && plan.branches.length === 0;
  return (
    <Dialog
      size="m"
      role={nothingToDelete ? "alertdialog" : "dialog"}
      title={
        state.status === "done"
          ? t.cleanUpBranchesDoneTitle
          : nothingToDelete
            ? t.cleanUpBranchesBlockedTitle
            : t.cleanUpBranchesTitle
      }
      titleId="clean-up-branches-title"
      icon={state.status === "done" ? <CircleCheck /> : nothingToDelete ? <TriangleAlert /> : <Trash2 />}
      tone={state.status === "done" ? "success" : nothingToDelete ? "warning" : "danger"}
      onClose={requestClose}
      closeLabel={t.commonClose}
      dismissible={!isBusy}
      dialogRef={dialogRef}
    >
      {state.status === "loading" && (
        <>
          <LoadingPlaceholder label={t.cleanUpBranchesLoading} className="branch-dialog__placeholder">
            <p className="app-dialog__text"><TextPlaceholder width="74%" /></p>
            <p className="app-dialog__text"><TextPlaceholder width="52%" /></p>
            <p className="app-dialog__text"><TextPlaceholder width="61%" /></p>
          </LoadingPlaceholder>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose}>{t.commonCancel}</button>
            <button className="danger-button" type="button" disabled>
              {/* No count until the plan says which branches can go: it may
                  leave some out, and the label would change under the eye. */}
              <Trash2 aria-hidden="true" />{t.cleanUpBranchesConfirmPending}
            </button>
          </div>
        </>
      )}

      {state.status === "blocked" && (
        <>
          <ErrorBanner error={state.error} t={t} />
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
            <button className="primary-button" type="button" onClick={() => setRetryToken((value) => value + 1)}>
              {t.branchesRetry}
            </button>
          </div>
        </>
      )}

      {plan && (
        <>
          {plan.branches.length > 0 ? (
            <p className="app-dialog__text">{t.cleanUpBranchesLead}</p>
          ) : (
            <p className="app-dialog__text" role="status">{t.cleanUpBranchesNothing}</p>
          )}
          {branches.length > asked.length && (
            <p className="app-dialog__text">{t.cleanUpBranchesCapped(asked.length, branches.length)}</p>
          )}

          {plan.branches.length > 0 && (
            <fieldset className="clean-up-branches" disabled={isBusy}>
              <legend className="visually-hidden">{t.cleanUpBranchesListLabel}</legend>
              {/* The branches are items going into the delete, so they wear the
                  Changes list's include node: a disc in, a ring out, and
                  "All branches" a half moon when only some are. */}
              <label className="clean-up-branches__all">
                <InclusionNode
                  inRow
                  className="clean-up-branches__node"
                  checked={allChosen}
                  indeterminate={someChosen}
                  onChange={() => setChosen(new Set(allChosen ? [] : plan.branches.map((branch) => branch.name)))}
                />
                <span>{t.cleanUpBranchesSelectAll(chosenBranches.length, plan.branches.length)}</span>
              </label>
              <ul {...autoHideScrollbarProps<HTMLUListElement>()} className="clean-up-branches__list auto-hide-scrollbar">
                {plan.branches.map((branch) => (
                  <li key={branch.name}>
                    <label className="clean-up-branches__branch">
                      <InclusionNode
                        inRow
                        className="clean-up-branches__node"
                        checked={chosen.has(branch.name)}
                        onChange={() => toggle(branch.name, !chosen.has(branch.name))}
                      />
                      <span className="clean-up-branches__name" title={branch.name}>{branch.name}</span>
                      {branchGlyphs(branch.name)}
                      <small className="clean-up-branches__kept">
                        {keptOn(branch, t)}
                      </small>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {plan.excluded.length > 0 && (
            <details className="app-dialog__details clean-up-branches__excluded">
              <summary>{t.cleanUpBranchesExcludedHeading(plan.excluded.length)}</summary>
              <ul>
                {plan.excluded.map((branch) => (
                  <li key={branch.name}>
                    <strong>{branch.name}</strong>
                    <span>{localizeAppError(branch.reason, t, t.errorGitCommandFailed)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* An option for the action, not an item in it: a checkbox, not
              the include node. Off by default: it changes what the whole
              team sees. Shown whenever the plan has a published branch, and
              held back — with why — while no chosen branch has one, so ticking
              branches never makes it come and go. */}
          {anyPublished && (
            <label className="app-dialog__check app-dialog__check--block">
              <input
                className="app-checkbox"
                type="checkbox"
                checked={deleteRemote && publishedChosen > 0}
                disabled={isBusy || publishedChosen === 0}
                onChange={(event) => setDeleteRemote(event.target.checked)}
              />
              <span>
                <strong>{t.cleanUpBranchesRemoteLabel(publishedChosen)}</strong>
                <small>
                  {publishedChosen === 0
                    ? t.cleanUpBranchesRemoteNoneNote
                    : deleteRemote
                      ? t.cleanUpBranchesRemoteOnNote
                      : t.cleanUpBranchesRemoteOffNote}
                </small>
              </span>
            </label>
          )}

          {plan.branches.length > 0 && (
            <DialogFacts
              facts={[
                { icon: <ShieldCheck />, text: t.cleanUpBranchesRecoveryFact, safe: true },
              ]}
            />
          )}

          {state.status === "delete-error" && <ErrorBanner error={state.error} t={t} />}

          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>
              {plan.branches.length > 0 ? t.commonCancel : t.commonClose}
            </button>
            {plan.branches.length > 0 && (
              <button
                className="danger-button"
                type="button"
                onClick={handleConfirm}
                disabled={isBusy || chosenBranches.length === 0}
                title={chosenBranches.length === 0 ? t.cleanUpBranchesNoneChosen : undefined}
              >
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {t.cleanUpBranchesDeleting}
                  </>
                ) : (
                  <>
                    <Trash2 aria-hidden="true" />
                    {t.cleanUpBranchesConfirm(chosenBranches.length)}
                  </>
                )}
              </button>
            )}
          </div>
        </>
      )}

      {state.status === "done" && <CleanUpSummary result={state.result} t={t} onClose={requestClose} />}
    </Dialog>
  );
}

/** What a clean-up that did not go entirely to plan did, branch by branch. */
function CleanUpSummary({
  result,
  t,
  onClose,
}: {
  result: CleanUpBranchesResult;
  t: Translations;
  onClose: () => void;
}): React.JSX.Element {
  const skipped = result.branches.filter((branch) => branch.outcome === "skipped");
  const remoteFailed = result.branches.filter((branch) => branch.outcome === "deleted" && branch.remoteError !== null);
  const deleted = result.branches.length - skipped.length;
  return (
    <>
      <p className="app-dialog__text" role="status">
        {t.cleanUpBranchesSummary(deleted, skipped.length, remoteFailed.length)}
      </p>
      {skipped.length > 0 && (
        <section className="clean-up-branches__outcome" aria-label={t.cleanUpBranchesSkippedHeading}>
          <h3>{t.cleanUpBranchesSkippedHeading}</h3>
          <ul>
            {skipped.map((branch) => (
              <li key={branch.name}>
                <strong>{branch.name}</strong>
                <span>{localizeAppError(branch.reason, t, t.errorGitCommandFailed)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {remoteFailed.length > 0 && (
        <section className="clean-up-branches__outcome" aria-label={t.cleanUpBranchesRemoteFailedHeading}>
          <h3>{t.cleanUpBranchesRemoteFailedHeading}</h3>
          <ul>
            {remoteFailed.map((branch) => (
              <li key={branch.name}>
                <strong>{branch.name}</strong>
                {/* Credentials are worth naming; every other refusal is the
                    remote's, and the generic wording for its code is about
                    publishing, not deleting. */}
                <span>
                  {isAppError(branch.remoteError) && branch.remoteError.code === "authentication_failed"
                    ? localizeAppError(branch.remoteError, t, t.cleanUpBranchesRemoteRefused)
                    : t.cleanUpBranchesRemoteRefused}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {deleted > 0 && <DialogFacts facts={[{ icon: <ShieldCheck />, text: t.cleanUpBranchesRecoveryKept, safe: true }]} />}
      <div className="dialog-actions">
        <button className="primary-button" type="button" onClick={onClose} data-autofocus>
          {t.commonClose}
        </button>
      </div>
    </>
  );
}
