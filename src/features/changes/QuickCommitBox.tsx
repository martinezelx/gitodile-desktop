import React, { useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Save, X } from "lucide-react";
import { useLanguage } from "../../i18n";
import { localizeAppError, isAppError } from "../../shared/i18n";
import { useScrollAnchoredResize } from "../../shared/ui";
import { usePersistedInstallDraft } from "../../runtime/drafts";
import {
  createSaveVersionController,
  PUBLISH_AFTER_SAVE_STORAGE_KEY,
  saveVersionPort,
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

type QuickCommitStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  /** `ranHooks` records the attempt, not the preference — same reasoning as
   * `SaveVersionDialog`'s `save-error` state: the "skip hooks" escape is only
   * honest to offer after an attempt that actually ran them. */
  | { kind: "error"; error: unknown; ranHooks: boolean }
  | { kind: "success"; title: string; shortCommit: string };

/** The fast path for the common case, docked at the foot of the file list.
 *
 * Closed, it is one row — the same height as the search box above it — so it
 * does not cost the list a card's worth of height while nobody is using it.
 * It opens on focus and closes again on blur, unless there is a draft or an
 * operation in flight to protect. "Save Version" in the header still opens
 * the full dialog with its plan preview, for the cases that want one. */
export function QuickCommitBox({
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
  const [publishToo, setPublishToo] = useState<boolean>(
    () => localStorage.getItem(PUBLISH_AFTER_SAVE_STORAGE_KEY) === "1",
  );
  const [status, setStatus] = useState<QuickCommitStatus>({ kind: "idle" });

  // Keeps the file list's own scroll position anchored to this box's bottom
  // edge across every open/close, not just the lucky case where the list was
  // already scrolled to its end. See the `fileListRef` prop doc, and
  // `useScrollAnchoredResize`'s own doc, for why and how.
  const { containerRef, snapshot } = useScrollAnchoredResize(fileListRef, expanded);
  function beginExpandedChange(next: boolean): void {
    snapshot();
    setExpanded(next);
  }

  const togglePublishToo = (): void => {
    setPublishToo((current) => {
      const next = !current;
      localStorage.setItem(PUBLISH_AFTER_SAVE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const isBusy = status.kind === "saving";
  const wasRejectedByHook =
    status.kind === "error" && status.ranHooks && isAppError(status.error) && status.error.code === "hook_rejected";

  function clearStaleStatus(): void {
    if (status.kind === "success") {
      setStatus({ kind: "idle" });
    }
  }

  function collapse(): void {
    beginExpandedChange(false);
    setStatus({ kind: "idle" });
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

  async function handleSave(attemptHooks: boolean = runHooks): Promise<void> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !canSave || isBusy) {
      return;
    }
    beginExpandedChange(true);
    setStatus({ kind: "saving" });
    try {
      const plan = await controller.plan({ projectId: projectPath, sessionEpoch, selectedPaths });
      const result = await controller.save({
        projectId: projectPath,
        sessionEpoch,
        title: trimmedTitle,
        description: description.trim() ? description.trim() : null,
        stateToken: plan.stateToken,
        selectedPaths,
        runHooks: attemptHooks,
      });
      clearMessageDraft();
      setStatus({ kind: "success", title: result.title, shortCommit: result.shortCommit });
      onSaveCompleted();
      if (publishToo) {
        onPublishNow();
      }
    } catch (error) {
      setStatus({ kind: "error", error, ranHooks: attemptHooks });
    }
  }

  return (
    <div
      ref={containerRef}
      className={`changes-quick-commit${expanded ? " changes-quick-commit--expanded" : ""}`}
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
          <Save aria-hidden="true" />
          <input
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
          {status.kind === "error" && (
            <p className="changes-quick-commit__error" role="alert">
              <CircleAlert aria-hidden="true" />
              {localizeAppError(status.error, t, t.errorGitCommandFailed)}
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
          {status.kind === "success" && (
            <p className="changes-quick-commit__success" role="status">
              <CheckCircle2 aria-hidden="true" />
              {t.saveVersionSuccessDescription(status.title, status.shortCommit)}
            </p>
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
