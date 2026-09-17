import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Check, CircleAlert, CloudUpload, LoaderCircle, Save, X } from "lucide-react";
import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import { useScrollAnchoredResize } from "../../shared/ui";
import { usePersistedInstallDraft } from "../../runtime/drafts";
import {
  createSaveVersionController,
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

/** What the Changes screen can ask of the box from outside: open it and put
 * the caret in the name field. The screen's Ctrl/Cmd+S goes here. */
export type QuickCommitBoxHandle = { focus: () => void };

/** The one place a version is saved from the Changes screen, docked at the
 * foot of the file list it saves.
 *
 * Closed, it is one row — the same height as the search box above it — so
 * it does not cost the list a card's worth of height while nobody is using
 * it; its glyph is the band's solid "do this" circle, breathing while there
 * is something to save (DESIGN.md § Motion). It opens on focus, asks Rust
 * for the plan of what it would save and states it in one line (the files,
 * the line they land on, and any note that applies), and closes again on
 * blur unless there is a draft or an operation in flight to protect. The
 * flow underneath — plan, save, hooks, "also publish" — is
 * `useSaveVersionFlow`, the same one `SaveVersionDialog` runs for the
 * screens with nowhere to type. */
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
   * tooltip on the toggle, so publishing is not a leap in the dark without
   * costing the row a second line. `null` before a first publish, when
   * Publish itself is what asks which remote. */
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
  const [messageDraft, setMessageDraft, clearMessageDraft] = usePersistedInstallDraft(
    `quick-save-version:${projectPath}`,
    "quick version message",
    EMPTY_QUICK_MESSAGE,
    isEmptyQuickMessage,
    isQuickMessage,
  );
  const { title, description } = messageDraft;
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
  function beginExpandedChange(next: boolean): void {
    snapshot();
    setExpanded(next);
  }

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

  function collapse(): void {
    beginExpandedChange(false);
  }
  /** The escape hatch for "opened this by accident": clears whatever draft is
   * there and folds the box back to its one-line rest state, same as Escape
   * does. Not offered mid-save — the fields disabled then are the same
   * signal, and clearing what a request already captured would just be
   * confusing to watch. */
  function handleDismiss(): void {
    if (isBusy) return;
    clearMessageDraft();
    collapse();
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

  const notes = plan ? getSaveVersionNotes(plan, t) : [];
  const planLabel = plan
    ? [t.saveVersionFilesSummary(plan.totalFiles), plan.branch ? t.saveVersionDestination(plan.branch) : null]
        .filter((part) => part !== null)
        .join(" ")
    : "";
  /* The glyph is the band's tile vocabulary in miniature: solid accent and
     breathing while there is a save to make and nobody is making it, the
     light "done" fill with a check once one was made. */
  const isSaved = status === "success";
  const breathes = !expanded && canSave && status === "idle";

  return (
    <div
      ref={containerRef}
      className={`changes-quick-commit${expanded ? " changes-quick-commit--expanded" : ""}${isSaved ? " changes-quick-commit--saved" : ""}`}
      onFocus={() => beginExpandedChange(true)}
      onBlur={(event) => {
        if (containerRef.current?.contains(event.relatedTarget as Node | null)) return;
        if (isBusy || title.trim() || description.trim()) return;
        collapse();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          handleDismiss();
        }
      }}
    >
      <div className="changes-quick-commit__field">
        <div className="changes-quick-commit__summary-wrap">
          <span className={`changes-quick-commit__glyph${breathes ? " attention-breathe" : ""}`} aria-hidden="true">
            {isSaved ? <Check /> : <Save />}
          </span>
          <input
            ref={titleRef}
            className="changes-quick-commit__summary"
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
          {/* Hidden by CSS rather than left unmounted while closed — same
              idiom as the file list's own search box clear button above it,
              down to the shape: an affordance attached to a field is
              rectangular, not a circle (DESIGN.md § Shape). */}
          <button
            type="button"
            className="changes-quick-commit__dismiss"
            aria-label={t.changesQuickCommitDismiss}
            disabled={isBusy}
            onClick={handleDismiss}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="changes-quick-commit__extra">
        <div>
          {/* What this save would do, from the plan that will write it, so
              the line and the save cannot disagree. One line — the files,
              then the line they land on — and under it only the notes that
              apply to this plan, the same ones the dialog prints in full. */}
          {plan && !isSaved && (
            <div className="changes-quick-commit__plan">
              <p className="changes-quick-commit__plan-line" aria-label={planLabel}>
                <span aria-hidden="true">{t.changesQuickPlanFiles(plan.totalFiles, plan.remainingFiles)}</span>
                {plan.branch && (
                  <span aria-hidden="true" className="changes-quick-commit__plan-destination">
                    <span className="changes-quick-commit__plan-arrow">→</span>
                    <span className="changes-quick-commit__plan-branch">{plan.branch}</span>
                  </span>
                )}
              </p>
              {notes.map((note) => (
                <p key={note} className="changes-quick-commit__plan-note">{note}</p>
              ))}
            </div>
          )}
          {(status === "save-error" || status === "blocked") && (
            <p className="changes-quick-commit__error" role="alert">
              <CircleAlert aria-hidden="true" />
              {localizeAppError(state.error, t, t.errorGitCommandFailed)}
            </p>
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
          {state.status === "success" && (
            <div className="changes-quick-commit__success" role="status">
              <p>{t.saveVersionSuccessDescription(state.result.title, state.result.shortCommit)}</p>
              {/* The step after this one, offered where the eye already is.
                  Absent when the toggle already took it there. */}
              {!publishToo && (
                <button type="button" className="changes-quick-commit__publish-now" onClick={onPublishNow}>
                  <CloudUpload aria-hidden="true" />
                  {t.saveVersionPublishNow}
                </button>
              )}
            </div>
          )}
          <textarea
            className="changes-quick-commit__desc"
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
          <div className="changes-quick-commit__foot">
            <div className="changes-quick-commit__publish">
              <span>{t.saveVersionPublishToggleLabel}</span>
              <button
                type="button"
                role="switch"
                aria-checked={publishToo}
                aria-label={t.saveVersionPublishToggleLabel}
                data-tooltip={remoteLabel ?? undefined}
                className={`toggle-switch${publishToo ? " toggle-switch--on" : ""}`}
                disabled={isBusy}
                onClick={togglePublishToo}
              >
                <span className="toggle-switch__knob" />
              </button>
            </div>
            <button
              className="primary-button primary-button--sm changes-quick-commit__action"
              type="button"
              disabled={!canSave || !title.trim() || isBusy}
              data-tooltip={!canSave ? t.changesSaveVersionNoSelectionHint : undefined}
              onClick={() => void handleSave()}
            >
              {isBusy ? (
                <>
                  <LoaderCircle aria-hidden="true" className="icon--spinning" />
                  {t.saveVersionSaving}
                </>
              ) : (
                <>
                  {/* Fixed label, unlike the dialog's own button: swapping in
                      a longer "Save and publish" here on every toggle click
                      is what reflowed this row before — see the CSS for the
                      widths that made it wrap outright regardless. */}
                  <Save aria-hidden="true" />
                  {t.saveVersionConfirm}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
