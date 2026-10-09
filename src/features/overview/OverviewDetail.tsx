import React, { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  Cloud,
  CloudUpload,
  Eye,
  Laptop,
  RotateCcw,
  Save,
  Split,
  TriangleAlert,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { useActiveScreenEffect, useScreenLifecycle } from "../../runtime/screen/module";
import { formatRelativeCheckTime } from "../../shared/i18n";
import { formatHistoryDate, useActiveHistoryState, type HistoryController } from "../history";
import type { PendingVersionsResult } from "../publish";
import { splitPath, type ChangeCategory, type WorkingTreeStatus } from "../status";
import { sampleChangesPreview } from "./changesPreview";
import type { Journey } from "./journey";
import { useFitCount, useOverviewFits } from "./fit";
import { CHANGE_ICONS } from "./OverviewNow";
import { DetailListPlaceholder, WorkScenePlaceholder } from "./OverviewPlaceholder";
import { playSceneTransition, sameSceneFacts, type SceneFacts } from "./sceneMotion";
import { useActiveWorkDetail, WORK_DETAIL_COMMIT_LIMIT, type WorkDetailController } from "./workDetail";

/** Rows a detail card lists while the screen scrolls as a page. */
const DETAIL_LIST_LIMIT = 5;
/** The most rows a detail card draws when the screen fits the window. */
const DETAIL_FIT_LIMIT = 30;
/** The "and N more" line under the rows, kept free when some are left out. */
const DETAIL_MORE_SPACE = 26;
/** How many dots the scene's path draws, whatever the real count. */
const SCENE_DOTS = 3;

export type OverviewDetailMode = "save" | "resolve" | "publish" | "bring" | "calm";

/** Which detail the column shows: it follows the next step. Local work comes
 * first; once it is saved, what waits on the remote, then what waits to be
 * published; with nothing waiting, where the work is. */
export function overviewDetailMode(journey: Journey): OverviewDetailMode {
  const { changes, publish } = journey;
  if (changes.state === "conflicts") return "resolve";
  if (changes.state === "dirty") return "save";
  if (changes.state !== "clean") return "calm";
  if ((publish.state === "behind" || publish.state === "diverged") && publish.behind > 0) return "bring";
  // With no remote there is nowhere to publish to: the scene, with its empty
  // cloud and "Connect", is the useful answer.
  if (publish.pending > 0 && publish.state !== "noRemote") return "publish";
  return "calm";
}

type FileItem = { path: string; category: ChangeCategory };

function FileList({
  files,
  hidden,
  onOpen,
  listRef,
}: {
  files: FileItem[];
  hidden: number;
  onOpen?: (path: string) => void;
  /** The box the rows are fitted to, while the screen fits the window. */
  listRef?: React.Ref<HTMLUListElement>;
}): React.JSX.Element {
  const { t } = useLanguage();
  return (
    <ul className="overview-detail__files" ref={listRef}>
      {files.map((file) => {
        const { name, dir } = splitPath(file.path);
        const body = (
          <>
            <span className={`overview-detail__kind overview-detail__kind--${file.category}`} aria-hidden="true">
              {CHANGE_ICONS[file.category]}
            </span>
            <span className="overview-detail__name">{name}</span>
            {dir && <span className="overview-detail__dir">{dir}</span>}
          </>
        );
        return (
          <li key={file.path} data-fit-row="">
            {onOpen ? (
              <button
                className="overview-detail__file"
                type="button"
                onClick={() => onOpen(file.path)}
                aria-label={t.overviewChangesPreviewOpenFile(file.path)}
                data-tooltip={file.path}
              >
                {body}
              </button>
            ) : (
              <span className="overview-detail__file" data-tooltip={file.path}>{body}</span>
            )}
          </li>
        );
      })}
      {hidden > 0 && <li className="overview-detail__more">{t.overviewDetailMore(hidden)}</li>}
    </ul>
  );
}

function LineTotals({ added, removed }: { added: number; removed: number }): React.JSX.Element {
  const { t } = useLanguage();
  const total = added + removed;
  return (
    <p className="overview-detail__lines" aria-label={t.overviewDetailLines(added, removed)}>
      <span className="overview-detail__added" aria-hidden="true">+{added}</span>
      <span className="overview-detail__removed" aria-hidden="true">−{removed}</span>
      <span className="overview-detail__bar" aria-hidden="true">
        <i className="overview-detail__bar-added" style={{ flexGrow: total ? added : 1 }} />
        <i className="overview-detail__bar-removed" style={{ flexGrow: total ? removed : 0 }} />
      </span>
    </p>
  );
}

function DetailCard({
  icon,
  title,
  link,
  busy,
  children,
  note,
}: {
  icon: React.JSX.Element;
  title: string;
  link?: { label: string; onClick: () => void };
  busy?: boolean;
  children: React.ReactNode;
  note?: { icon: React.JSX.Element; text: string };
}): React.JSX.Element {
  const titleId = useId();
  return (
    <section className="overview-detail" aria-labelledby={titleId} aria-busy={busy}>
      <header className="overview-detail__head">
        {icon}
        <h2 id={titleId}>{title}</h2>
        {link && (
          <button className="overview-detail__link" type="button" onClick={link.onClick}>
            {link.label}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </header>
      {children}
      {note && (
        <p className="overview-detail__note">
          {note.icon}
          <span>{note.text}</span>
        </p>
      )}
    </section>
  );
}

/**
 * The column beside the timeline. It follows the next-step card: while the
 * card asks to save, resolve, get or publish, a small scene of where the work
 * is leads it and, under the scene, what that step will move; with nothing
 * waiting the scene takes the column. A discard that can still be restored
 * sits under it, and its button opens the restore picker itself.
 */
export function OverviewDetail({
  mode,
  journey,
  workingTree,
  pendingVersions,
  workDetail,
  historyController,
  projectPath,
  sessionEpoch,
  onReviewChanges,
  onResolve,
  onGetChanges,
  onOpenHistory,
  onOpenProjectSettings,
  onRestoreDiscarded,
}: {
  mode: OverviewDetailMode;
  journey: Journey;
  workingTree: WorkingTreeStatus | null;
  pendingVersions: PendingVersionsResult;
  workDetail: WorkDetailController;
  historyController: HistoryController;
  projectPath: string;
  sessionEpoch: string;
  /** Opens Changes, with a file selected when given one. */
  onReviewChanges: (path?: string) => void;
  onResolve: () => void;
  onGetChanges: () => void;
  onOpenHistory: () => void;
  onOpenProjectSettings: () => void;
  /** Opens Changes with its restore picker already open. */
  onRestoreDiscarded: () => void;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const detail = useActiveWorkDetail(workDetail, query);
  const { publish } = journey;
  const [now, setNow] = useState(() => Date.now());
  // The card's list shows as many whole rows as its box has room for when the
  // screen fits the window; what changes the rows measures them again.
  const fits = useOverviewFits();
  const publishStates = pendingVersions.versions
    .slice(0, WORK_DETAIL_COMMIT_LIMIT)
    .map((version) => detail.commitFiles.get(version.commit)?.status ?? "-")
    .join("");
  const listKey =
    mode === "save" || mode === "resolve"
      ? `${mode}|${workingTree?.counts.total ?? 0}|${workingTree?.entries[0]?.path ?? ""}`
      : mode === "publish"
        ? `publish|${pendingVersions.totalCount}|${publishStates}`
        : mode === "bring"
          ? `bring|${detail.incoming?.status ?? "-"}|${detail.incoming?.status === "ready" ? detail.incoming.result.versions.length : 0}`
          : mode;
  const fit = useFitCount<HTMLUListElement>({
    fits,
    max: DETAIL_FIT_LIMIT,
    fallback: DETAIL_LIST_LIMIT,
    reserve: DETAIL_MORE_SPACE,
    contentKey: listKey,
  });
  useActiveScreenEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  let card: React.JSX.Element | null = null;
  if (mode === "save" && workingTree) {
    const shown = sampleChangesPreview(workingTree.entries, fit.count);
    card = (
      <DetailCard
        icon={<Save aria-hidden="true" />}
        title={t.overviewDetailSaveTitle}
        link={{ label: t.overviewDetailReview, onClick: () => onReviewChanges() }}
        note={{ icon: <Laptop aria-hidden="true" />, text: t.overviewDetailSaveNote }}
      >
        <p className="overview-detail__sum">
          <strong>{t.overviewDetailFiles(workingTree.counts.total)}</strong>
          <span>{t.overviewDetailInNextVersion}</span>
        </p>
        {workingTree.lineTotals && (
          <LineTotals added={workingTree.lineTotals.added} removed={workingTree.lineTotals.removed} />
        )}
        <FileList
          files={shown.map((entry) => ({ path: entry.path, category: entry.category }))}
          hidden={workingTree.counts.total - shown.length}
          onOpen={(path) => onReviewChanges(path)}
          listRef={fit.ref}
        />
      </DetailCard>
    );
  } else if (mode === "resolve" && workingTree) {
    const conflicted = workingTree.entries.filter((entry) => entry.category === "conflicted");
    const shown = conflicted.slice(0, fit.count);
    card = (
      <DetailCard
        icon={<Split aria-hidden="true" />}
        title={t.overviewDetailResolveTitle}
        link={{ label: t.overviewJourneyResolve, onClick: onResolve }}
        note={{ icon: <Eye aria-hidden="true" />, text: t.overviewDetailResolveNote }}
      >
        <p className="overview-detail__sum">
          <strong>{t.overviewDetailFiles(workingTree.counts.conflicted)}</strong>
          <span>{t.overviewDetailResolveSum}</span>
        </p>
        <FileList
          files={shown.map((entry) => ({ path: entry.path, category: entry.category }))}
          hidden={workingTree.counts.conflicted - shown.length}
          onOpen={(path) => onReviewChanges(path)}
          listRef={fit.ref}
        />
      </DetailCard>
    );
  } else if (mode === "publish") {
    // The files of every unpublished version read so far, newest first, each
    // path once.
    const considered = pendingVersions.versions.slice(0, WORK_DETAIL_COMMIT_LIMIT);
    const states = considered.map((version) => detail.commitFiles.get(version.commit));
    const seen = new Map<string, FileItem>();
    for (const state of states) {
      if (state?.status !== "ready") continue;
      for (const file of state.files) if (!seen.has(file.path)) seen.set(file.path, { path: file.path, category: file.category });
    }
    const files = [...seen.values()];
    const isReading = states.some((state) => !state || state.status === "loading");
    const failed = states.length > 0 && states.every((state) => state?.status === "error");
    const isPartial =
      pendingVersions.isTruncated
      || pendingVersions.totalCount > considered.length
      || states.some((state) => state?.status !== "ready");
    // "This line" is only true when the remote line has the project's line's
    // name; otherwise the note names where it goes.
    const otherLine =
      publish.remote && publish.destinationBranch && publish.destinationBranch !== publish.localBranch
        ? `${publish.remote} · ${publish.destinationBranch}`
        : null;
    card = (
      <DetailCard
        icon={<CloudUpload aria-hidden="true" />}
        title={t.overviewDetailPublishTitle}
        link={{ label: t.overviewDetailInHistory, onClick: onOpenHistory }}
        busy={isReading}
        note={publish.remote
          ? { icon: <Cloud aria-hidden="true" />, text: otherLine ? t.overviewDetailPublishNoteTo(otherLine) : t.overviewDetailPublishNote }
          : undefined}
      >
        {files.length > 0 ? (
          <>
            <p className="overview-detail__sum">
              <strong>{isPartial ? t.overviewDetailFilesAtLeast(files.length) : t.overviewDetailFiles(files.length)}</strong>
              <span>{t.overviewDetailInVersions(pendingVersions.totalCount)}</span>
            </p>
            <FileList
              files={files.slice(0, fit.count)}
              hidden={files.length - Math.min(files.length, fit.count)}
              listRef={fit.ref}
            />
          </>
        ) : failed ? (
          <p className="overview-detail__state overview-detail__state--error">
            <TriangleAlert aria-hidden="true" />
            {t.overviewDetailFilesError}
          </p>
        ) : (
          <DetailListPlaceholder label={t.overviewDetailLoading} />
        )}
      </DetailCard>
    );
  } else if (mode === "bring") {
    const incoming = detail.incoming;
    const versions = incoming?.status === "ready" ? incoming.result.versions : [];
    const total = incoming?.status === "ready" ? incoming.result.totalCount : publish.behind;
    const shown = versions.slice(0, fit.count);
    card = (
      <DetailCard
        icon={<ArrowDownToLine aria-hidden="true" />}
        title={t.overviewDetailBringTitle}
        link={{ label: t.overviewDetailReview, onClick: onGetChanges }}
        busy={!incoming || incoming.status === "loading"}
        note={{ icon: <Eye aria-hidden="true" />, text: t.overviewDetailBringNote }}
      >
        {!incoming || incoming.status === "loading" ? (
          // Not read yet, or being read: the list's shape holds its place.
          <DetailListPlaceholder label={t.overviewDetailVersionsLoading} />
        ) : incoming.status === "error" ? (
          <p className="overview-detail__state overview-detail__state--error">
            <TriangleAlert aria-hidden="true" />
            {t.overviewDetailVersionsError}
          </p>
        ) : (
          <p className="overview-detail__sum">
            <strong>{t.overviewDetailVersions(total)}</strong>
            {publish.remote && <span>{t.overviewDetailFrom(publish.remote)}</span>}
          </p>
        )}
        {shown.length > 0 && (
          <ul className="overview-detail__files" ref={fit.ref}>
            {shown.map((version) => (
              <li key={version.commit} data-fit-row="">
                <span className="overview-detail__version" title={version.title}>
                  <span className="overview-detail__incoming" aria-hidden="true" />
                  <span className="overview-detail__name">{version.title}</span>
                  {version.author && <span className="overview-detail__dir">{version.author}</span>}
                </span>
              </li>
            ))}
            {total > shown.length && <li className="overview-detail__more">{t.overviewDetailMore(total - shown.length)}</li>}
          </ul>
        )}
      </DetailCard>
    );
  }

  return (
    <aside className={`overview-side${card ? " overview-side--working" : ""}`}>
      {/* Where the work is first, then what the next step will move. */}
      <WorkScene
        size={card ? "small" : "large"}
        journey={journey}
        workingTree={workingTree}
        historyController={historyController}
        query={query}
        now={now}
        onOpenProjectSettings={onOpenProjectSettings}
      />
      {card}
      {!card && detail.recovery && (
        <div className="overview-restore">
          <span className="overview-restore__icon" aria-hidden="true"><RotateCcw /></span>
          <span className="overview-restore__copy">
            <span className="overview-restore__label">{t.overviewSafetyDiscarded}</span>
            <span className="overview-restore__hint">
              {t.overviewSafetyDiscardedHint(
                detail.recovery.fileCount,
                formatRelativeCheckTime(detail.recovery.createdAtMs, now, formats.language, t.statusBarJustNow),
              )}
            </span>
          </span>
          <button className="overview-restore__action" type="button" onClick={onRestoreDiscarded}>
            {t.overviewDiscardRestore}
          </button>
        </div>
      )}
    </aside>
  );
}

/**
 * Where the work is, drawn: this computer and the remote as two objects, and
 * the path between them telling how they stand — a check when they match,
 * green dots leaving for versions not yet published, dashed blue dots arriving
 * for versions waiting on the remote, a "?" when the remote could not be
 * asked, and an empty dashed cloud when there is no remote at all. Large when
 * nothing is waiting; small above the detail while there is work.
 */
function WorkScene({
  size,
  journey,
  workingTree,
  historyController,
  query,
  now,
  onOpenProjectSettings,
}: {
  size: "large" | "small";
  journey: Journey;
  workingTree: WorkingTreeStatus | null;
  historyController: HistoryController;
  query: { projectId: string; sessionEpoch: string };
  now: number;
  onOpenProjectSettings: () => void;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const history = useActiveHistoryState(historyController, query);
  const headCommit = history.snapshot?.headCommit ?? null;
  const head = headCommit ? history.versions.find((version) => version.commit === headCommit) : undefined;
  const headWhen = head ? (formatHistoryDate(head.committedAt ?? head.authoredAt, formats, now)?.relative ?? null) : null;

  const { publish, changes } = journey;
  const ready = Boolean(history.snapshot && workingTree && changes.state !== "loading" && publish.state !== "checking");
  const hasRemote = publish.state !== "noRemote" && publish.state !== "noUpstream";
  const unknown = ["notChecked", "checking", "unavailable", "unborn", "detached"].includes(publish.state);
  // Versions only travel where there is somewhere for them to go.
  const outgoing = hasRemote ? publish.pending : 0;
  const incoming = (publish.state === "behind" || publish.state === "diverged") ? publish.behind : 0;
  const synced = hasRemote && !unknown && outgoing === 0 && incoming === 0;
  const asking = unknown && hasRemote && outgoing === 0 && incoming === 0;
  const facts: SceneFacts | null = ready ? { outgoing, incoming, synced, unknown: asking, hasRemote } : null;
  const sceneRef = useSceneMotion(facts, query.projectId);

  // Until the history, the working tree and the remote's last known state are
  // read, the scene would draw a guess and then jump: its shape stands in
  // instead, and the real scene fades in once.
  if (!ready || !workingTree) {
    return <WorkScenePlaceholder size={size} label={t.overviewSceneLoading} />;
  }
  const unsaved = changes.state === "dirty" || changes.state === "conflicts" ? workingTree.counts.total : 0;

  const hereNote = unsaved > 0 ? t.overviewSceneUnsaved(unsaved) : (headWhen ?? "");
  const remoteNote = !hasRemote
    ? null
    : publish.state === "unavailable"
      ? t.overviewSceneNotChecked
      : incoming > 0
        ? t.overviewSceneNew(incoming)
        : outgoing > 0
          ? t.overviewSceneMissingYours(outgoing)
          : unknown
            ? t.overviewSceneNotChecked
            : t.overviewSceneSynced;
  const remoteName = publish.remote ?? t.overviewSceneRemote;
  const classes = [
    "work-scene",
    `work-scene--${size}`,
    !hasRemote ? "work-scene--no-copy" : "",
    unsaved > 0 ? "work-scene--unsaved" : "",
  ].filter(Boolean).join(" ");

  return (
    <section
      ref={sceneRef}
      className={classes}
      aria-label={t.overviewSceneLabel}
      title={hasRemote ? t.overviewSceneTooltip(remoteName) : undefined}
    >
      <div className="work-scene__row">
        <span className="work-scene__place work-scene__place--here" aria-hidden="true">
          <Laptop />
          {outgoing > 0 && <span className="work-scene__badge work-scene__badge--out">{outgoing}</span>}
        </span>
        <span
          className={`work-scene__path${synced ? " work-scene__path--synced" : ""}${unknown && hasRemote ? " work-scene__path--unknown" : ""}`}
          aria-hidden="true"
        >
          {synced && <span className="work-scene__mark"><Check /></span>}
          {asking && <span className="work-scene__mark work-scene__mark--unknown">?</span>}
          {(outgoing > 0 || incoming > 0) && (
            <span className="work-scene__dots">
              {Array.from({ length: Math.min(outgoing, SCENE_DOTS) }, (_, index) => <i key={`o${index}`} className="work-scene__dot work-scene__dot--out" />)}
              {Array.from({ length: Math.min(incoming, SCENE_DOTS) }, (_, index) => <i key={`i${index}`} className="work-scene__dot work-scene__dot--in" />)}
            </span>
          )}
        </span>
        <span className={`work-scene__place work-scene__place--remote${hasRemote ? "" : " work-scene__place--empty"}`} aria-hidden="true">
          <Cloud />
          {incoming > 0 && <span className="work-scene__badge work-scene__badge--in">{incoming}</span>}
        </span>
      </div>
      <div className="work-scene__captions">
        <p className="work-scene__caption">
          <span className="work-scene__name">{t.overviewSceneHere}</span>
          <span className="work-scene__note">{hereNote}</span>
        </p>
        <span />
        {hasRemote ? (
          <p className="work-scene__caption">
            <span className="work-scene__name work-scene__name--mono">{remoteName}</span>
            <span className={`work-scene__note${publish.state === "unavailable" ? " work-scene__note--failed" : ""}`}>{remoteNote}</span>
          </p>
        ) : (
          <p className="work-scene__caption">
            <span className="work-scene__name">{t.overviewSceneNoCopy}</span>
            {/* A line with no publish destination has a remote already; only a
                project with none is sent to connect one. */}
            {publish.state === "noRemote" && (
              <button className="work-scene__connect" type="button" onClick={onOpenProjectSettings}>
                {t.overviewSceneConnect}
              </button>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Plays one short animation when the scene's state changes while the Overview
 * is on screen, or on coming back to it after a change made elsewhere. Never
 * on the first drawing of a project, and never while the screen is hidden:
 * the last state seen stays the one the next animation starts from.
 */
function useSceneMotion(facts: SceneFacts | null, projectId: string): React.RefObject<HTMLElement | null> {
  const sceneRef = useRef<HTMLElement | null>(null);
  const seen = useRef<{ projectId: string; facts: SceneFacts } | null>(null);
  const lifecycle = useScreenLifecycle();
  const wasActive = useRef(lifecycle === "active");
  const key = facts ? `${facts.outgoing}|${facts.incoming}|${facts.synced}|${facts.unknown}|${facts.hasRemote}` : "";
  useLayoutEffect(() => {
    const returning = lifecycle === "active" && !wasActive.current;
    wasActive.current = lifecycle === "active";
    if (lifecycle !== "active" || !facts) return undefined;
    const before = seen.current;
    seen.current = { projectId, facts };
    if (!before || before.projectId !== projectId || sameSceneFacts(before.facts, facts)) return undefined;
    const play = () => {
      if (sceneRef.current) playSceneTransition(sceneRef.current, before.facts, facts);
    };
    // A screen coming back is laid out a frame later; the scene is measured
    // once it is visible again.
    if (!returning || typeof window.requestAnimationFrame !== "function") {
      play();
      return undefined;
    }
    const frame = window.requestAnimationFrame(play);
    return () => window.cancelAnimationFrame(frame);
    // `key` stands for `facts`, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lifecycle, projectId]);
  return sceneRef;
}
