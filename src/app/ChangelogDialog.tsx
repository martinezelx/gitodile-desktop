import React, { useId, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";

import { useLanguage } from "../i18n";
import { formatDate, type LocaleFormats } from "../shared/i18n";
import { ChannelGlyph, DialogCloseButton, ReleaseHighlights, autoHideScrollbarProps, useModalFocus } from "../shared/ui";
import { APP_CHANGELOG, CURRENT_APP_RELEASE, type AppReleaseEntry } from "./appRelease";

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

function ReleaseIdentity({
  release,
  isCurrent,
}: {
  release: AppReleaseEntry;
  isCurrent: boolean;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const releaseDate = formatReleaseDate(release.date, formats);

  return (
    <>
      <span className="changelog-release__identity">
        <h3>{t.changelogVersionHeading(release.version)}</h3>
        <ChannelGlyph channel={release.channel} />
        {isCurrent && <span className="changelog-release__current">{t.changelogCurrentRelease}</span>}
        {!isCurrent && release.highlights.length > 0 && (
          <span className="changelog-release__count">{t.changelogHighlightCount(release.highlights.length)}</span>
        )}
      </span>
      {releaseDate && release.date && (
        <span className="changelog-release__date">
          <time dateTime={release.date}>{releaseDate}</time>
        </span>
      )}
    </>
  );
}

function ReleaseBody({ release, id }: { release: AppReleaseEntry; id?: string }): React.JSX.Element {
  const { t, language } = useLanguage();

  /* Only the running build can be listed without highlights (a pipeline-only
     preview); it says so rather than opening onto nothing. */
  return release.highlights.length === 0
    ? <p id={id} className="changelog-release__empty">{t.changelogNoHighlights}</p>
    : <ReleaseHighlights id={id} className="changelog-release__notes" highlights={release.highlights} language={language} />;
}

/** The build being run is what the reader opened this dialog to learn about,
 * so its notes are already open — a disclosure would put a click between the
 * question and its only answer. */
function CurrentRelease({ release }: { release: AppReleaseEntry }): React.JSX.Element {
  return (
    <section className="changelog-current" aria-labelledby="changelog-current-heading">
      <div id="changelog-current-heading" className="changelog-release__heading">
        <ReleaseIdentity release={release} isCurrent />
      </div>
      <ReleaseBody release={release} />
    </section>
  );
}

/** An earlier release: one compact line — version, channel, how many notes
 * and when — that opens onto its notes on request. The count says whether a
 * release is worth opening before the reader spends the click. */
function EarlierRelease({ release }: { release: AppReleaseEntry }): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const notesId = useId();

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
          <ReleaseIdentity release={release} isCurrent={false} />
        </span>
      </button>
      {isExpanded && <ReleaseBody release={release} id={notesId} />}
    </li>
  );
}

/** The update line under the title. It follows the state rather than always
 * pairing it with the same link: when there is something to do (a new
 * version, one ready to install, one that cannot install yet) the state
 * itself is the way in; while a check or download is running there is nothing
 * to ask for, so there is no link; only a settled state — up to date, or no
 * answer — offers the check. Every path leaves for the update dialog, and
 * nothing here starts a check on its own.
 *
 * The way in from a state that asks for action only opens the update dialog:
 * a fresh check drops the offered candidate, so from "Ready to install" it
 * would throw away the download the reader is being invited to install. */
function UpdateLine({
  status,
  onCheckForUpdates,
  onOpenUpdates,
}: {
  status: AppUpdateStatusLine | null;
  onCheckForUpdates?: () => void;
  onOpenUpdates?: () => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();

  if (status?.tone === "attention" && onOpenUpdates) {
    return (
      <p className="about-dialog__update changelog-dialog__update">
        <button className="about-dialog__update-link changelog-dialog__update-action" type="button" onClick={onOpenUpdates}>
          {status.label}
        </button>
      </p>
    );
  }
  const offersCheck = onCheckForUpdates !== undefined && status?.tone !== "busy";
  if (!status && !offersCheck) {
    return null;
  }
  return (
    <p className="about-dialog__update changelog-dialog__update">
      {status && (
        <span className={`about-dialog__update-status about-dialog__update-status--${status.tone}`}>
          {status.tone === "ok" && <Check aria-hidden="true" />}
          {status.label}
        </span>
      )}
      {/* The separator travels with the link: when a long state leaves no
          room, both wrap together and no "·" is left hanging at a line end. */}
      {offersCheck && (
        <span className="changelog-dialog__update-check">
          {status && <span className="about-dialog__update-dot" aria-hidden="true">·</span>}
          <button className="about-dialog__update-link" type="button" onClick={onCheckForUpdates}>
            {t.commandCheckAppUpdates}
          </button>
        </span>
      )}
    </p>
  );
}

/** What the release model can say about updates in one short line; About
 * derives it and both About and What's new draw it. */
export type AppUpdateStatusLine = { tone: "ok" | "attention" | "busy" | "muted"; label: string };

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
  onOpenUpdates,
  updateStatus,
}: {
  isOpen: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onCheckForUpdates?: () => void;
  /** Opens the update dialog on its current state, without a new check. */
  onOpenUpdates?: () => void;
  /** The same update line About shows, so the two say one thing. */
  updateStatus?: AppUpdateStatusLine | null;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const earlierReleases = APP_CHANGELOG.filter((release) => release !== CURRENT_APP_RELEASE);

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
        {/* Mark and title, with About's update line under the title turned
            around: About states the update and links here; this states it
            and links to the check. Is there a newer version? is a question
            about the app, not one more entry in its history, so it heads the
            dialog rather than waiting below every old release. */}
        <header className="changelog-dialog__header">
          <div className="changelog-dialog__mark" aria-hidden="true">
            <Sparkles />
          </div>
          <div className="changelog-dialog__heading">
            <h2 id="changelog-title">{t.changelogTitle}</h2>
            <UpdateLine status={updateStatus ?? null} onCheckForUpdates={onCheckForUpdates} onOpenUpdates={onOpenUpdates} />
          </div>
        </header>
        <CurrentRelease release={CURRENT_APP_RELEASE} />
        {earlierReleases.length > 0 && (
          <section className="changelog-earlier" aria-labelledby="changelog-earlier-heading">
            <h3 id="changelog-earlier-heading" className="changelog-earlier__heading">{t.changelogEarlierHeading}</h3>
            {/* `role="list"` because both lists drop `list-style`, and WebKit —
                the engine behind the macOS build — removes list semantics along
                with the marker. The count is the point here: "six changes in this
                release" is what a screen-reader user is owed. */}
            <ol className="changelog" role="list">
              {earlierReleases.map((release) => (
                <EarlierRelease key={`${release.version}-${release.channel}`} release={release} />
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
