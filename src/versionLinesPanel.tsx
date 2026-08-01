import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, CircleAlert, GitBranch, LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { useLanguage } from "./i18n";
import type { VersionLine, VersionLinesSnapshot } from "./versionLines";
import { CreateVersionLineDialog, DeleteVersionLineDialog, SwitchVersionLineDialog } from "./versionLinesDialog";

type DialogRequest =
  | { kind: "create"; forceSwitch: boolean }
  | { kind: "switch"; target: string }
  | { kind: "delete"; target: string }
  | null;

function VersionLineRow({
  line,
  language,
  compact,
  onSwitch,
  onDelete,
}: {
  line: VersionLine;
  language: string;
  /** Used for the "other lines" list, which can get long: a tighter row so
   * many lines stay scannable, with the same technical details tucked
   * behind the disclosure instead of taking permanent vertical space. */
  compact?: boolean;
  onSwitch: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const savedDate = line.tip.committedAt
    ? new Date(line.tip.committedAt).toLocaleDateString(language, { year: "numeric", month: "short", day: "numeric" })
    : "";
  const isCheckedOutElsewhere = line.worktreePath !== null;

  return (
    <li
      className={`version-line-row${line.isActive ? " version-line-row--active" : ""}${compact ? " version-line-row--compact" : ""}`}
    >
      <div className="version-line-row__icon" aria-hidden="true">
        <GitBranch />
      </div>
      <div className="version-line-row__body">
        <div className="version-line-row__name-row">
          <span className="version-line-row__name" title={line.name}>
            {line.name}
          </span>
          {line.isActive && <span className="version-line-row__badge">{t.versionLinesActiveLabel}</span>}
        </div>
        <p className="version-line-row__meta">
          {line.tip.subject}
          {savedDate && <> — {t.versionLinesSavedLabel(savedDate)}</>}
        </p>
        <div className="version-lines-pills">
          {line.upstream ? (
            <span className="publish-stays__pill">{t.versionLinesUpstreamLabel(line.upstream)}</span>
          ) : (
            <span className="publish-stays__pill publish-stays__pill--unsaved">
              {t.versionLinesNoUpstreamLabel}
            </span>
          )}
          {line.uniqueCommitCount !== null && line.uniqueCommitCount > 0 && (
            <span className="publish-stays__pill">{t.versionLinesUniqueCommits(line.uniqueCommitCount)}</span>
          )}
        </div>
        {isCheckedOutElsewhere && (
          <p className="save-version-note">{t.versionLinesCheckedOutElsewhere(line.worktreePath ?? "")}</p>
        )}
        <details className="version-line-row__details">
          <summary>
            <ChevronRight aria-hidden="true" className="version-line-row__details-chevron" />
            {t.versionLinesTechnicalDetails}
          </summary>
          <dl>
            <div>
              <dt>{t.versionLinesRefNameLabel}</dt>
              <dd>{line.name}</dd>
            </div>
            <div>
              <dt>{t.versionLinesTipCommitLabel}</dt>
              <dd>{line.tip.shortCommit}</dd>
            </div>
          </dl>
        </details>
      </div>
      {!line.isActive && (
        <div className="version-line-row__actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onSwitch}
            disabled={isCheckedOutElsewhere}
          >
            {t.versionLinesSwitchButton}
          </button>
          <button
            className="secondary-button version-line-row__delete"
            type="button"
            onClick={onDelete}
            disabled={isCheckedOutElsewhere}
            aria-label={`${t.versionLinesDeleteButton}: ${line.name}`}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}

export function VersionLinesPanel({
  projectPath,
  snapshot,
  error,
  isLoading,
  onRefresh,
  onSnapshot,
  onChanged,
  onSaveVersion,
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
  autoOpenCreate,
  onAutoOpenCreateHandled,
}: {
  projectPath: string;
  /** The project session's cached branch inventory, or `null` if this project
   * has never loaded one. Reading it (and the refresh that keeps it current)
   * belongs to `main.tsx`, so navigating away from this screen and back
   * re-renders the known answer instead of restarting from a spinner — see
   * task 019. */
  snapshot: VersionLinesSnapshot | null;
  /** A failed read, already localized. Shown as a full error screen only when
   * there is no `snapshot` to fall back on; alongside one it degrades to a
   * "this may be stale" note. */
  error: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  /** A fresh snapshot returned by a create/switch/delete, handed back so the
   * session cache reflects the mutation without waiting for a re-read. */
  onSnapshot: (snapshot: VersionLinesSnapshot) => void;
  /** Called after any successful create/switch/delete so the rest of the
   * app (repository facts, working-tree status, selection) can invalidate
   * itself — see `main.tsx`'s `handleVersionLineChanged`. */
  onChanged: () => void;
  onSaveVersion: () => void;
  /** Registers the dialog as a path-scoped mutation before it opens. Returns
   * false when another session sharing this Git directory owns a mutation. */
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  /** Set by the command palette's "New version line" action, which can fire
   * from any screen — this opens the create dialog as soon as the panel
   * mounts instead of only reacting to its own "New version line" button. */
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
}): React.JSX.Element {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState("");
  const [prefixFilter, setPrefixFilter] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogRequest>(null);

  function openDialog(request: Exclude<DialogRequest, null>): void {
    if (onOperationStart()) {
      setDialog(request);
    }
  }

  function closeDialog(): void {
    setDialog(null);
    onOperationFinish();
  }

  useEffect(() => {
    if (autoOpenCreate) {
      openDialog({ kind: "create", forceSwitch: false });
      onAutoOpenCreateHandled?.();
    }
    // Deliberately fires once per truthy transition of `autoOpenCreate`
    // (the parent flips it back to false right after), not on every render.
  }, [autoOpenCreate]);

  // Derived from whatever names this project actually uses (`feature/`,
  // `bugfix/`, `claude/`, a team's own convention…) rather than a hardcoded
  // git-flow list, so the filter stays useful regardless of naming style.
  // Sorted by how common each prefix is, most common first.
  const prefixCounts = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const line of snapshot.lines) {
      if (line.isActive) {
        continue;
      }
      const slashIndex = line.name.indexOf("/");
      if (slashIndex <= 0) {
        continue;
      }
      const prefix = line.name.slice(0, slashIndex);
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [snapshot]);

  // Drops a filter that no longer matches anything (e.g. the last branch
  // under that prefix was just deleted) instead of silently showing an
  // empty list with no visible explanation.
  useEffect(() => {
    if (prefixFilter && !prefixCounts.some(([prefix]) => prefix === prefixFilter)) {
      setPrefixFilter(null);
    }
  }, [prefixFilter, prefixCounts]);

  const others = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const query = search.trim().toLowerCase();
    return snapshot.lines
      .filter((line) => !line.isActive)
      .filter((line) => !query || line.name.toLowerCase().includes(query))
      .filter((line) => !prefixFilter || line.name.startsWith(`${prefixFilter}/`));
  }, [snapshot, search, prefixFilter]);
  const active = snapshot?.lines.find((line) => line.isActive) ?? null;

  function handleMutated(next: VersionLinesSnapshot): void {
    onSnapshot(next);
    setDialog(null);
    onChanged();
    onOperationFinish();
  }

  return (
    <div className="version-lines-view">
      <header className="version-lines-view__header">
        <div>
          <h1>{t.versionLinesTitle}</h1>
          <p>{t.versionLinesExplanation}</p>
        </div>
        {snapshot?.headState !== "unborn" && (
          <button
            className="primary-button"
            type="button"
            onClick={() => openDialog({ kind: "create", forceSwitch: snapshot?.headState === "detached" })}
          >
            <Plus aria-hidden="true" />
            {t.versionLinesNewButton}
          </button>
        )}
      </header>

      {/* Only when there is genuinely nothing to show: with a cached snapshot
          the background refresh stays invisible, which is the whole point of
          keeping it in the session. */}
      {!snapshot && isLoading && (
        <div className="changes-loading" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
          <p>{t.versionLinesLoading}</p>
        </div>
      )}

      {!snapshot && !isLoading && error && (
        <div className="changes-empty">
          <p role="alert">
            <CircleAlert aria-hidden="true" />
            {error}
          </p>
          <button className="primary-button" type="button" onClick={onRefresh}>
            {t.versionLinesRetry}
          </button>
        </div>
      )}

      {snapshot && (
        <>
          {/* A refresh that fails after a successful one keeps the known list
              visible, but must still say it may be out of date. */}
          {error && !isLoading && (
            <p className="save-version-note" role="alert">
              {t.statusRefreshFailedNote}
            </p>
          )}
          {snapshot.headState === "detached" && (
            <div className="version-lines-banner" role="status">
              <h2>{t.versionLinesDetachedTitle}</h2>
              <p>{t.versionLinesDetachedDescription}</p>
              <button
                className="primary-button"
                type="button"
                onClick={() => openDialog({ kind: "create", forceSwitch: true })}
              >
                <GitBranch aria-hidden="true" />
                {t.versionLinesDetachedRecoverButton}
              </button>
            </div>
          )}

          {snapshot.headState === "unborn" && (
            <div className="version-lines-banner" role="status">
              <h2>{t.versionLinesUnbornTitle}</h2>
              <p>{t.versionLinesUnbornDescription}</p>
            </div>
          )}

          {active && (
            <ul className="version-lines-list version-lines-list--active">
              <VersionLineRow line={active} language={language} onSwitch={() => undefined} onDelete={() => undefined} />
            </ul>
          )}

          <div className="version-lines-search-box">
            <label className="version-lines-search-box__input">
              <Search aria-hidden="true" />
              <span className="visually-hidden">{t.versionLinesSearchAriaLabel}</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.versionLinesSearchPlaceholder}
                aria-label={t.versionLinesSearchAriaLabel}
              />
            </label>

            {prefixCounts.length > 0 && (
              <div className="version-lines-filter-chips" role="group" aria-label={t.versionLinesFilterAriaLabel}>
                <button
                  type="button"
                  className={`version-lines-filter-chip${prefixFilter === null ? " version-lines-filter-chip--active" : ""}`}
                  aria-pressed={prefixFilter === null}
                  onClick={() => setPrefixFilter(null)}
                >
                  {t.versionLinesFilterAllLabel}
                </button>
                {prefixCounts.map(([prefix, count]) => (
                  <button
                    key={prefix}
                    type="button"
                    className={`version-lines-filter-chip${prefixFilter === prefix ? " version-lines-filter-chip--active" : ""}`}
                    aria-pressed={prefixFilter === prefix}
                    onClick={() => setPrefixFilter((current) => (current === prefix ? null : prefix))}
                  >
                    {prefix} ({count})
                  </button>
                ))}
              </div>
            )}
          </div>

          {others.length === 0 ? (
            <p className="version-lines-empty-note">
              {search.trim() || prefixFilter ? t.versionLinesNoSearchMatches : t.versionLinesEmptyOthers}
            </p>
          ) : (
            <ul className="version-lines-list">
              {others.map((line) => (
                <VersionLineRow
                  key={line.name}
                  line={line}
                  language={language}
                  compact
                  onSwitch={() => openDialog({ kind: "switch", target: line.name })}
                  onDelete={() => openDialog({ kind: "delete", target: line.name })}
                />
              ))}
            </ul>
          )}

          {snapshot.isTruncated && (
            <p className="save-version-note">
              {t.versionLinesTruncatedNote(snapshot.lines.length, snapshot.totalCount)}
            </p>
          )}

          {snapshot.unreadableCount > 0 && (
            <p className="save-version-note" role="status">
              {t.versionLinesUnreadableNote(snapshot.unreadableCount)}
            </p>
          )}
        </>
      )}

      <CreateVersionLineDialog
        isOpen={dialog?.kind === "create"}
        projectPath={projectPath}
        forceSwitch={dialog?.kind === "create" ? dialog.forceSwitch : undefined}
        onClose={closeDialog}
        onCreated={handleMutated}
        onPhaseChange={onOperationPhaseChange}
      />
      <SwitchVersionLineDialog
        isOpen={dialog?.kind === "switch"}
        projectPath={projectPath}
        target={dialog?.kind === "switch" ? dialog.target : ""}
        onClose={closeDialog}
        onSwitched={handleMutated}
        onSaveVersion={onSaveVersion}
        onCreateWithWork={() => openDialog({ kind: "create", forceSwitch: false })}
        onPhaseChange={onOperationPhaseChange}
      />
      <DeleteVersionLineDialog
        isOpen={dialog?.kind === "delete"}
        projectPath={projectPath}
        target={dialog?.kind === "delete" ? dialog.target : ""}
        onClose={closeDialog}
        onDeleted={handleMutated}
        onPhaseChange={onOperationPhaseChange}
      />
    </div>
  );
}
