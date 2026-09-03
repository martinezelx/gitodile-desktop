import React, { useId, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Bug,
  ChevronDown,
  FolderOpen,
  GitBranch,
  History,
  ListChecks,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
} from "lucide-react";

import { useLanguage } from "../i18n";
import { formatDate, type LocaleFormats } from "../shared/i18n";
import { useModalFocus } from "../shared/ui";
import { APP_CHANGELOG, type AppReleaseEntry, type AppReleaseNoteId } from "./appRelease";

/** Dates are stored as ISO in the release model and formatted here, so the
 * same entry reads correctly in every supported language. A missing or unparseable date
 * yields no row rather than "Invalid Date" — a changelog is a factual
 * document and a broken one is worse than a quiet one. */
function formatReleaseDate(date: string | null, formats: LocaleFormats): string | null {
  if (date === null) {
    return null;
  }
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return formatDate(parsed, formats);
}

const RELEASE_NOTE_ICONS: Record<AppReleaseNoteId, React.ComponentType<{ "aria-hidden": true }>> = {
  projectSessions: FolderOpen,
  saveAndPublish: Send,
  historyTimeline: History,
  truthfulStatus: ListChecks,
  safeLineSwitching: GitBranch,
  releaseDetails: Sparkles,
  publicIssueReporting: Bug,
  previewVersions: Tag,
  canonicalIdentity: ShieldCheck,
};

function ReleaseNotes({
  release,
  isCurrent,
}: {
  release: AppReleaseEntry;
  isCurrent: boolean;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const notesId = useId();
  const releaseDate = formatReleaseDate(release.date, formats);

  return (
    <li className="changelog-release">
      <button
        className="changelog-release__trigger"
        type="button"
        aria-expanded={isExpanded}
        aria-controls={notesId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <span className="changelog-release__heading">
          <span className="changelog-release__chevron" aria-hidden="true">
            <ChevronDown />
          </span>
          <span className="changelog-release__identity">
            <h3>{t.changelogVersionHeading(release.version)}</h3>
            <span className={`changelog-release__channel changelog-release__channel--${release.channel}`}>
              {release.channel}
            </span>
            {isCurrent && <span className="changelog-release__current">{t.changelogCurrentRelease}</span>}
          </span>
          {releaseDate && release.date && (
            <span className="changelog-release__date">
              <time dateTime={release.date}>{releaseDate}</time>
            </span>
          )}
        </span>
      </button>
      {isExpanded && (
        <ul id={notesId} className="changelog-release__notes" role="list">
          {release.noteIds.map((noteId) => {
            const NoteIcon = RELEASE_NOTE_ICONS[noteId];
            return (
              <li key={noteId}>
                <span className="changelog-release__note-icon" aria-hidden="true"><NoteIcon aria-hidden /></span>
                <span>{t.changelogNotes[noteId]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * The bundled release notes, on their own surface.
 *
 * It shares the About shell (`.about-dialog`) the way the shortcuts dialog
 * does: one dialog language for the small, informational overlays, with only
 * the parts that actually differ — a release list instead of a product
 * identity — carrying their own class names.
 */
export function ChangelogDialog({
  isOpen,
  setOpen,
}: {
  isOpen: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalFocus(isOpen, dialogRef, setOpen);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="about-dialog changelog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="about-dialog__close" type="button" aria-label={t.commonClose} onClick={() => setOpen(false)}>
          <X aria-hidden="true" />
        </button>
        <div className="changelog-dialog__mark" aria-hidden="true">
          <Sparkles />
        </div>
        <p className="eyebrow">{t.changelogEyebrow}</p>
        <h2 id="changelog-title">{t.changelogTitle}</h2>
        <p>{t.changelogDescription}</p>
        {/* `role="list"` because both lists drop `list-style`, and WebKit —
            the engine behind the macOS build — removes list semantics along
            with the marker. The count is the point here: "six changes in this
            release" is what a screen-reader user is owed. */}
        <ol className="changelog" role="list">
          {APP_CHANGELOG.map((release, index) => (
            <ReleaseNotes
              key={`${release.version}-${release.channel}`}
              release={release}
              isCurrent={index === 0}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}
