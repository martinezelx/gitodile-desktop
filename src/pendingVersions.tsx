import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, CircleAlert, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { useLanguage, type Translations } from "./i18n";
import { CATEGORY_ICONS, DiffResultView, type FileDiff } from "./changes";
import { getFileTypeIcon } from "./fileIcons";
import type { CommitFileChange, PendingVersionsResult } from "./publish";
import { autoHideScrollbarProps } from "./autoHideScrollbar";

type FilesState = "loading" | "error" | CommitFileChange[];
type DiffState = "loading" | "error" | FileDiff;

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
                {CATEGORY_ICONS[file.category]}
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
  result,
  error,
  onRetry,
  onPublishUpTo,
}: {
  projectPath: string;
  result: PendingVersionsResult;
  error: string | null;
  onRetry: () => void;
  onPublishUpTo: (commit: string) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [filesByCommit, setFilesByCommit] = useState<Record<string, FilesState>>({});
  const [selectedFileByCommit, setSelectedFileByCommit] = useState<Record<string, string | undefined>>({});
  const [diffsByCommit, setDiffsByCommit] = useState<Record<string, Record<string, DiffState>>>({});

  function toggleCommit(commit: string, isOpen: boolean): void {
    if (!isOpen || filesByCommit[commit] !== undefined) {
      return;
    }
    setFilesByCommit((current) => ({ ...current, [commit]: "loading" }));
    invoke<CommitFileChange[]>("read_commit_file_changes", { path: projectPath, commit })
      .then((files) => setFilesByCommit((current) => ({ ...current, [commit]: files })))
      .catch(() => setFilesByCommit((current) => ({ ...current, [commit]: "error" })));
  }

  function toggleFile(commit: string, filePath: string): void {
    setSelectedFileByCommit((current) => ({
      ...current,
      [commit]: current[commit] === filePath ? undefined : filePath,
    }));
    if (diffsByCommit[commit]?.[filePath] !== undefined) {
      return;
    }
    setDiffsByCommit((current) => ({
      ...current,
      [commit]: { ...current[commit], [filePath]: "loading" },
    }));
    invoke<FileDiff>("read_commit_file_diff", { path: projectPath, commit, filePath })
      .then((diff) =>
        setDiffsByCommit((current) => ({
          ...current,
          [commit]: { ...current[commit], [filePath]: diff },
        })),
      )
      .catch(() =>
        setDiffsByCommit((current) => ({
          ...current,
          [commit]: { ...current[commit], [filePath]: "error" },
        })),
      );
  }

  return (
    <section className="pending-versions" aria-labelledby="pending-versions-heading">
      <div className="pending-versions__heading">
        <div>
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
        {error && (
          <button className="secondary-button pending-versions__retry" type="button" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            {t.saveVersionRetry}
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
          {result.versions.map((version) => (
            <li key={version.commit} className="pending-versions__item">
              <details
                className="pending-versions__details"
                onToggle={(event) => toggleCommit(version.commit, event.currentTarget.open)}
              >
                <summary className="pending-versions__summary">
                  <ChevronDown aria-hidden="true" className="pending-versions__chevron" />
                  <span className="pending-versions__description" data-tooltip={version.title}>
                    {version.title}
                  </span>
                  <code className="pending-versions__hash">{version.shortCommit}</code>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
