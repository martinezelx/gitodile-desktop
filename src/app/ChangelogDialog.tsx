import React, { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Sparkles, X } from "lucide-react";

import { useLanguage } from "../i18n";
import { useModalFocus } from "../shared/ui";
import { APP_CHANGELOG, CURRENT_APP_RELEASE, type AppReleaseEntry } from "./appRelease";

/** Dates are stored as ISO in the release model and formatted here, so the
 * same entry reads correctly in every supported language. An unparseable date
 * yields no row rather than "Invalid Date" — a changelog is a factual
 * document and a broken one is worse than a quiet one. */
function formatReleaseDate(date: string, language: string): string | null {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(parsed);
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
  const { t, language } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalFocus(isOpen, dialogRef, setOpen);

  if (!isOpen) {
    return null;
  }

  const isCurrent = (release: AppReleaseEntry): boolean =>
    release.version === CURRENT_APP_RELEASE.version && release.channel === CURRENT_APP_RELEASE.channel;

  return (
    <div className="about-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
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
          {APP_CHANGELOG.map((release) => {
            const releaseDate = formatReleaseDate(release.date, language);
            return (
              <li key={`${release.version}-${release.channel}`} className="changelog-release">
                <div className="changelog-release__heading">
                  <h3>{t.changelogVersionHeading(release.version)}</h3>
                  <span className="changelog-release__channel">{release.channel}</span>
                  {isCurrent(release) && (
                    <span className="changelog-release__current">{t.changelogCurrentRelease}</span>
                  )}
                  {releaseDate && (
                    <span className="changelog-release__date">
                      <time dateTime={release.date}>{releaseDate}</time>
                    </span>
                  )}
                </div>
                <ul className="changelog-release__notes" role="list">
                  {release.noteIds.map((noteId) => (
                    <li key={noteId}>{t.changelogNotes[noteId]}</li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
