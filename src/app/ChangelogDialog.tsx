import React, { useId, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  ArrowRight,
  Bug,
  ChevronDown,
  CloudDownload,
  FolderOpen,
  GitBranch,
  History,
  ListChecks,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";

import { useLanguage } from "../i18n";
import { formatDate, type LocaleFormats } from "../shared/i18n";
import { DialogCloseButton, autoHideScrollbarProps, useModalFocus } from "../shared/ui";
import { APP_CHANGELOG, type AppReleaseEntry, type HighlightIcon } from "./appRelease";

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

/** Every name in the glyph catalogue, drawn. `Record<HighlightIcon, …>`
 * is what keeps this complete: a name added to the catalogue without a glyph
 * here fails to compile rather than rendering nothing. */
const HIGHLIGHT_ICON_COMPONENTS: Record<HighlightIcon, React.ComponentType<{ "aria-hidden": true }>> = {
  bug: Bug,
  "cloud-download": CloudDownload,
  "folder-open": FolderOpen,
  "git-branch": GitBranch,
  history: History,
  "list-checks": ListChecks,
  send: Send,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  tag: Tag,
};

function ReleaseNotes({
  release,
  isCurrent,
}: {
  release: AppReleaseEntry;
  isCurrent: boolean;
}): React.JSX.Element {
  const { t, language, formats } = useLanguage();
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
            <span className={`channel-badge changelog-release__channel channel-badge--${release.channel}`}>
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
      {isExpanded && release.highlights.length === 0 && (
        /* Only the running build can be listed without highlights (a
           pipeline-only preview); it says so rather than opening onto nothing. */
        <p id={notesId} className="changelog-release__empty">{t.changelogNoHighlights}</p>
      )}
      {isExpanded && release.highlights.length > 0 && (
        <ul id={notesId} className="changelog-release__notes" role="list">
          {release.highlights.map((highlight) => {
            const NoteIcon = HIGHLIGHT_ICON_COMPONENTS[highlight.icon];
            return (
              <li key={highlight.id}>
                <span className="changelog-release__note-icon" aria-hidden="true"><NoteIcon aria-hidden /></span>
                <span>{highlight[language]}</span>
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
  onCheckForUpdates,
}: {
  isOpen: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onCheckForUpdates?: () => void;
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
        {...autoHideScrollbarProps<HTMLDivElement>()}
        ref={dialogRef}
        className="about-dialog changelog-dialog auto-hide-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogCloseButton label={t.commonClose} onClick={() => setOpen(false)} />
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
        {/* The one thing this list cannot answer — is there a newer one? —
            is a remote question, so it sits after the local notes as a
            footer, not among them: a quiet control that leaves for the
            update dialog. Nothing here starts that check on its own. */}
        {onCheckForUpdates && (
          <footer className="changelog-dialog__footer">
            <button className="ghost-button changelog-dialog__update" type="button" onClick={onCheckForUpdates}>
              {t.commandCheckAppUpdates}
              <ArrowRight aria-hidden="true" />
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
