import React, { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ChevronRight,
  Cloud,
  CloudUpload,
  Eye,
  RotateCcw,
  Save,
  Split,
  TriangleAlert,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { useActiveScreenEffect } from "../../runtime/screen/module";
import { formatRelativeTime } from "../../shared/i18n";
import { autoHideScrollbarProps } from "../../shared/ui";
import type { PendingVersionsResult } from "../publish";
import { splitPath, type ChangeCategory, type WorkingTreeStatus } from "../status";
import { sampleChangesPreview } from "./changesPreview";
import type { Journey } from "./journey";
import { useFitCount, useMoreBelow, useOverviewFits } from "./fit";
import { CHANGE_ICONS } from "./OverviewNow";
import { DetailListPlaceholder } from "./OverviewPlaceholder";
import { useActiveWorkDetail, WORK_DETAIL_COMMIT_LIMIT, type WorkDetailController } from "./workDetail";

/** Rows a detail card lists while the screen scrolls as a page. */
const DETAIL_LIST_LIMIT = 5;
/** The most rows a detail card draws when the screen fits the window. */
const DETAIL_FIT_LIMIT = 30;
/** The "and N more" line under the rows, kept free when some are left out. */
const DETAIL_MORE_SPACE = 26;
/** The most files "What you'll save" lists while its list scrolls; the rest
 * are counted under the last one, and Changes has them all. */
const SAVE_SCROLL_LIMIT = 50;

export type OverviewDetailMode = "save" | "resolve" | "publish" | "bring" | "calm";

/** Which detail the column shows: it follows the next step. Local work comes
 * first; once it is saved, what waits on the remote, then what waits to be
 * published; with nothing waiting, no card. */
export function overviewDetailMode(journey: Journey): OverviewDetailMode {
  const { changes, publish } = journey;
  if (changes.state === "conflicts") return "resolve";
  if (changes.state === "dirty") return "save";
  if (changes.state !== "clean") return "calm";
  if ((publish.state === "behind" || publish.state === "diverged") && publish.behind > 0) return "bring";
  // With no remote there is nowhere to publish to: the next-step card's
  // "Connect" is the useful answer.
  if (publish.pending > 0 && publish.state !== "noRemote") return "publish";
  return "calm";
}

type FileItem = { path: string; category: ChangeCategory };

function FileList({
  files,
  hidden,
  onOpen,
  listRef,
  scroll,
}: {
  files: FileItem[];
  hidden: number;
  onOpen?: (path: string) => void;
  /** The box the rows are fitted to, or that scrolls, while the screen fits the window. */
  listRef?: React.Ref<HTMLUListElement>;
  /** The list scrolls rather than fitting whole rows; `moreBelow` fades its bottom edge. */
  scroll?: { moreBelow: boolean };
}): React.JSX.Element {
  const { t } = useLanguage();
  return (
    <ul
      {...(scroll ? autoHideScrollbarProps<HTMLUListElement>() : {})}
      // The class stays fixed while it scrolls: the scrollbar's pointer state
      // is set outside React. The fade rides on an attribute.
      className={scroll ? "overview-detail__files overview-detail__files--scroll auto-hide-scrollbar" : "overview-detail__files"}
      data-more-below={scroll?.moreBelow || undefined}
      ref={listRef}
    >
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
  /** `lead` points the link out, as the way on from the end of the list. */
  link?: { label: string; onClick: () => void; lead?: boolean };
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
          <button
            className={`overview-detail__link${link.lead ? " overview-detail__link--lead attention-breathe" : ""}`}
            type="button"
            onClick={link.onClick}
          >
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
 * card asks to save, resolve, get or publish, it shows what that step will
 * move. A discard that can still be restored sits under it whenever
 * everything is saved, and its button opens the restore picker over the
 * Overview. With neither there is no column, and the timeline takes the width.
 */
export function OverviewDetail({
  mode,
  journey,
  workingTree,
  pendingVersions,
  workDetail,
  projectPath,
  sessionEpoch,
  onReviewChanges,
  onResolve,
  onGetChanges,
  onOpenHistory,
  onRestoreDiscarded,
}: {
  mode: OverviewDetailMode;
  journey: Journey;
  workingTree: WorkingTreeStatus | null;
  pendingVersions: PendingVersionsResult;
  workDetail: WorkDetailController;
  projectPath: string;
  sessionEpoch: string;
  /** Opens Changes, with a file selected when given one. */
  onReviewChanges: (path?: string) => void;
  onResolve: () => void;
  onGetChanges: () => void;
  onOpenHistory: () => void;
  /** Opens the restore picker over the Overview. */
  onRestoreDiscarded: () => void;
}): React.JSX.Element | null {
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
  // While the screen fits the window, what you'll save scrolls rather than
  // fitting whole rows: the files are the reason to look at it. The other
  // cards fit theirs.
  const scrollsFiles = fits && mode === "save";
  const fit = useFitCount<HTMLUListElement>({
    fits: fits && !scrollsFiles,
    max: DETAIL_FIT_LIMIT,
    fallback: DETAIL_LIST_LIMIT,
    reserve: DETAIL_MORE_SPACE,
    contentKey: listKey,
  });
  const saveScroll = useMoreBelow<HTMLUListElement>(scrollsFiles, listKey);
  // A new project starts at the top of its list, not where the last one was left.
  useEffect(() => {
    saveScroll.ref.current?.scrollTo?.({ top: 0 });
  }, [projectPath, saveScroll.ref]);
  useActiveScreenEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  let card: React.JSX.Element | null = null;
  if (mode === "save" && workingTree) {
    const shown = sampleChangesPreview(workingTree.entries, scrollsFiles ? SAVE_SCROLL_LIMIT : fit.count);
    card = (
      <DetailCard
        icon={<Save aria-hidden="true" />}
        title={t.overviewDetailSaveTitle}
        // Scrolled to the end, Review is the way on to every file, as
        // "View all" is at the end of the timeline.
        link={{ label: t.overviewDetailReview, onClick: () => onReviewChanges(), lead: scrollsFiles && saveScroll.reachedEnd }}
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
          listRef={scrollsFiles ? saveScroll.ref : fit.ref}
          scroll={scrollsFiles ? { moreBelow: saveScroll.moreBelow } : undefined}
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

  // One copy says what it holds; several are counted, and the line dates the
  // newest, since the picker is where each one is told apart. Files are never
  // added up: copies can share them. "When" reads as the timeline's does.
  const recovery = detail.recovery;
  const restoreCopies = recovery && recovery.restorableCount > 1 ? recovery.restorableCount : 0;
  const restoreWhen = recovery ? formatRelativeTime(new Date(recovery.createdAtMs), formats, now) : "";
  const restoreHint = !recovery
    ? ""
    : restoreCopies > 0
      ? t.overviewSafetyDiscardedLatest(restoreWhen)
      : t.overviewSafetyDiscardedHint(recovery.fileCount, restoreWhen);

  // Whenever everything is saved, whatever the remote waits on: with work on
  // screen a restore would land on top of it, and Changes is where that
  // choice is made. Under a detail card it is a compact row; alone in the
  // column it is a card of its own, headed like its siblings.
  const restore = journey.changes.state !== "clean" || !recovery ? null : !card ? (
    <DetailCard
      icon={<RotateCcw aria-hidden="true" />}
      title={t.overviewSafetyDiscarded}
      link={{ label: t.overviewDiscardRestore, onClick: onRestoreDiscarded }}
    >
      <p className="overview-detail__sum">
        <strong>
          {restoreCopies > 0 ? t.overviewSafetyDiscardedCopies(restoreCopies) : t.overviewDetailFiles(recovery.fileCount)}
        </strong>
        <span>{restoreCopies > 0 ? t.overviewSafetyDiscardedLatest(restoreWhen) : t.overviewSafetyDiscardedWhen(restoreWhen)}</span>
      </p>
    </DetailCard>
  ) : (
    <div className="overview-restore">
      <span className="overview-restore__place" aria-hidden="true">
        <RotateCcw />
        {restoreCopies > 0 && <span className="overview-restore__badge">{restoreCopies}</span>}
      </span>
      <span className="overview-restore__copy">
        <span className="overview-restore__label">{t.overviewSafetyDiscarded}</span>
        {restoreCopies > 0 && <span className="visually-hidden">{t.overviewSafetyDiscardedCopies(restoreCopies)}</span>}
        <span className="overview-restore__hint">
          {restoreHint}
        </span>
      </span>
      <button className="overview-restore__action" type="button" onClick={onRestoreDiscarded}>
        {t.overviewDiscardRestore}
      </button>
    </div>
  );

  // With nothing to move and nothing to restore there is no column: the
  // timeline takes the width.
  if (!card && !restore) return null;

  return (
    <aside className={`overview-side${card ? " overview-side--working" : ""}`}>
      {card}
      {restore}
    </aside>
  );
}
