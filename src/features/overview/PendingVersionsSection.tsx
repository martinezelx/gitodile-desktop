import React from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  GitCommitVertical,
  Layers,
  LoaderCircle,
  Send,
  User,
} from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { DiffResultView, type FileDiff } from "../changes";
import { CHANGE_CATEGORY_ICONS } from "../status";
import { getFileTypeIcon } from "../../fileIcons";
import type { PendingVersionsResult } from "../publish";
import { usePendingVersionDetails, type DiffState, type FilesState } from "./pendingVersionDetails";
import { autoHideScrollbarProps } from "../../shared/ui";

function diffPanelHeight(diff: DiffState | undefined): number {
  if (typeof diff !== "object") {
    return 64;
  }
  if (diff.kind !== "text") {
    return 120;
  }
  const lineCount = diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
  const markerCount = Math.max(0, diff.hunks.length - 1);
  const truncatedNoteHeight = diff.truncated ? 40 : 0;
  return Math.min(300, Math.max(44, lineCount * 20 + markerCount * 32 + truncatedNoteHeight + 24));
}

function CommitFilesList({
  commit,
  files,
  selectedPath,
  diffs,
  onToggleFile,
  t,
}: {
  commit: string;
  files: FilesState | undefined;
  selectedPath: string | undefined;
  diffs: Record<string, DiffState> | undefined;
  onToggleFile: (commit: string, filePath: string) => void;
  t: Translations;
}): React.JSX.Element | null {
  if (files === undefined || files === "loading") {
    return (
      <p className="pending-versions__files-status" role="status">
        <LoaderCircle aria-hidden="true" className="icon--spinning" />
        {t.publishLoadingFiles}
      </p>
    );
  }
  if (files === "error") {
    return (
      <p className="pending-versions__files-status pending-versions__files-status--error" role="alert">
        <CircleAlert aria-hidden="true" />
        {t.publishFilesError}
      </p>
    );
  }
  if (files.length === 0) {
    return null;
  }
  return (
    <ul className="pending-versions__files">
      {files.map((file) => {
        const isSelected = selectedPath === file.path;
        const diff = diffs?.[file.path];
        const FileTypeIcon = getFileTypeIcon(file.path);
        return (
          <li key={file.path} className="pending-versions__file">
            <button
              type="button"
              className="pending-versions__file-button"
              aria-expanded={isSelected}
              onClick={() => onToggleFile(commit, file.path)}
            >
              <ChevronRight aria-hidden="true" className="pending-versions__file-chevron" />
              <FileTypeIcon aria-hidden="true" className="pending-versions__file-type-icon" />
              <span className="pending-versions__file-path">{file.path}</span>
              <span className="pending-versions__file-category" aria-hidden="true">
                {CHANGE_CATEGORY_ICONS[file.category]}
              </span>
            </button>
            {isSelected && (
              <div className="pending-versions__diff" style={{ height: diffPanelHeight(diff) }}>
                {(diff === undefined || diff === "loading") && (
                  <p className="pending-versions__diff-status" role="status">
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {t.publishLoadingDiff}
                  </p>
                )}
                {diff === "error" && (
                  <p className="pending-versions__diff-status pending-versions__diff-status--error" role="alert">
                    <CircleAlert aria-hidden="true" />
                    {t.publishDiffError}
                  </p>
                )}
                {typeof diff === "object" && <DiffResultView diff={diff} t={t} />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PendingVersionsSection({
  projectPath,
  sessionEpoch,
  result,
  error,
  onPublishUpTo,
  canPublish,
  onPublish,
}: {
  projectPath: string;
  sessionEpoch: string;
  result: PendingVersionsResult;
  error: string | null;
  onPublishUpTo: (commit: string) => void;
  /** False on a detached HEAD or unborn line — there is nowhere for a publish
   * to go, so the header's own "Publish all" is withheld even though the
   * per-version rows (still individually reachable) already guard themselves
   * the same way one level up, in `main.tsx`'s `canPublish`. */
  canPublish: boolean;
  onPublish: () => void;
}): React.JSX.Element {
  const { t, language } = useLanguage();
  const { filesByCommit, selectedFileByCommit, diffsByCommit, toggleCommit, toggleFile } =
    usePendingVersionDetails(projectPath, sessionEpoch);

  return (
    <section className="pending-versions card-row-divider" aria-labelledby="pending-versions-heading">
      <div className="pending-versions__heading">
        {/* Mirrors `.project-hero`'s own icon-plus-text opening, so the two
            halves of "what's waiting on you" read as siblings, not as a card
            and then an unrelated list bolted on below it. */}
        <div className="pending-versions__icon" aria-hidden="true">
          <Layers />
        </div>
        <div className="pending-versions__heading-text">
          <h2 className="pending-versions__title" id="pending-versions-heading">
            {t.overviewPendingVersionsTitle(result.totalCount)}
          </h2>
          <p className="pending-versions__guidance">{t.overviewPendingVersionsGuidance}</p>
          {result.isTruncated && (
            <p className="pending-versions__guidance">
              {t.overviewPendingVersionsTruncated(result.versions.length, result.totalCount)}
            </p>
          )}
        </div>
        {!error && canPublish && (
          <button className="primary-button pending-versions__publish-all" type="button" onClick={onPublish}>
            <Send aria-hidden="true" />
            {t.overviewPublishAll(result.totalCount)}
          </button>
        )}
      </div>

      {error && (
        <p className="pending-versions__error" role="alert">
          <CircleAlert aria-hidden="true" />
          {error}
        </p>
      )}

      {result.versions.length > 0 && (
        <ul
          {...autoHideScrollbarProps<HTMLUListElement>()}
          className="pending-versions__list auto-hide-scrollbar"
        >
          {result.versions.map((version, index) => (
            <li key={version.commit} className="pending-versions__item">
              {/* The graph: an off-the-shelf icon (its own stroke already
                  extends a stub above and below the circle) standing in for a
                  custom-drawn commit node, plus one shared connecting line
                  behind the whole column (`.pending-versions__list::before`)
                  rather than a line segment per row. The newest version — the
                  one that would actually be at the tip after a publish — is
                  the only one marked active; the rest are equally "older",
                  so there is nothing to distinguish between them. */}
              <div
                className={`pending-versions__node${index === 0 ? " pending-versions__node--active" : ""}`}
                aria-hidden="true"
              >
                <GitCommitVertical />
              </div>
              <div className="pending-versions__card">
                <details
                  className="pending-versions__details"
                  onToggle={(event) => toggleCommit(version.commit, event.currentTarget.open)}
                >
                  <summary className="pending-versions__summary">
                    <ChevronDown aria-hidden="true" className="pending-versions__chevron" />
                    <span className="pending-versions__description" data-tooltip={version.title}>
                      {version.title}
                    </span>
                    <span className="pending-versions__meta">
                      {new Date(version.committedAt).toLocaleDateString(language, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {/* Absent, not an empty pill, when Git has no author name
                        to report (a malformed or very old commit) — a blank
                        chip would look broken, not just uninformative. The
                        name itself truncates from the end with an ellipsis
                        (`.pending-versions__author-name`); the tooltip and
                        the chip's own text content still carry the full
                        value for a pointer hover or a screen reader. */}
                    {version.author && (
                      <span className="pending-versions__author" data-tooltip={version.author}>
                        <User aria-hidden="true" />
                        <span className="pending-versions__author-name">{version.author}</span>
                      </span>
                    )}
                  </summary>
                  {version.description && (
                    <p className="pending-versions__message-body">{version.description}</p>
                  )}
                  <CommitFilesList
                    commit={version.commit}
                    files={filesByCommit[version.commit]}
                    selectedPath={selectedFileByCommit[version.commit]}
                    diffs={diffsByCommit[version.commit]}
                    onToggleFile={toggleFile}
                    t={t}
                  />
                </details>
                <button
                  type="button"
                  className="pending-versions__publish-button"
                  onClick={() => onPublishUpTo(version.commit)}
                >
                  <Send aria-hidden="true" />
                  <span>{t.overviewPublishUpTo}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
