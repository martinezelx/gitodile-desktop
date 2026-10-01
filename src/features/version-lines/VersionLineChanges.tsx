import React, { useLayoutEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n";
import { formatNumber } from "../../shared/i18n";
import { CHANGE_CATEGORY_ICONS, type ChangeCategory } from "../status";
import type { ChangedFile, LineChanges } from "./domain";

/** A file row's height, which is what decides how many fit. */
const ROW_HEIGHT = 24;
/* The widest bar: the file that changes most fills it, the others in
   proportion. */
const BAR_WIDTH = 64;

function splitPath(path: string): { name: string; folder: string } {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? { name: path, folder: "" } : { name: path.slice(slash + 1), folder: path.slice(0, slash + 1) };
}

/** The categories Changes and History already mark a file with, so a file
 * added on a line wears the same glyph and colour here as in the save box. */
const CATEGORY_OF: Record<ChangedFile["status"], ChangeCategory> = {
  added: "new",
  deleted: "deleted",
  modified: "changed",
  renamed: "renamed",
};

/** What the selected line changes against the main line, from the parting to
 * its tip — the comparison a pull request makes — or, for a line that came
 * back, what it brought: the totals on one line, then the files that change
 * most, each with its counts and a bar split between what it adds and what it
 * removes, as many as the panel's height holds, and how many more there are.
 *
 * It takes the height the panel has left, so it grows with the window rather
 * than scrolling: a list inside a panel that does not scroll, cut to what
 * fits, with the rest counted. Pressing a file does nothing yet — the full
 * comparison is "Compare", still to come. */
export function VersionLineChanges({
  changes,
  base,
  brought,
}: {
  /** `null` while the line's read is out: the section keeps its place. */
  changes: LineChanges | null;
  base: string;
  /** The line came back into the main line: this is what it brought. */
  brought: boolean;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const listRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(0);

  // As many rows as the list's height holds; the last one is given to "and N
  // more" when not every file fits.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const measure = (): void => setFits(Math.max(0, Math.floor(list.clientHeight / ROW_HEIGHT)));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const title = brought ? t.versionLinesChangesBroughtTitle(base) : t.versionLinesChangesTitle(base);
  const files = changes?.files ?? [];
  const total = changes?.filesChanged ?? 0;
  /* Before the list has been laid out — or where there is no layout at all —
     it holds the eight a short panel would. */
  const capacity = fits > 0 ? fits : 8;
  const allFit = total <= capacity && files.length === total;
  const shown = allFit ? files : files.slice(0, Math.max(0, capacity - 1));
  const more = total - shown.length;
  const largest = Math.max(1, ...files.map((file) => (file.additions ?? 0) + (file.deletions ?? 0)));

  return (
    <section className="version-lines-card version-lines-card--fill version-lines-changes" aria-label={title}>
      <div className="version-lines-card__head">
        <h3>{title}</h3>
        {/* Where the full comparison will open, stated rather than hidden. */}
        <span className="version-lines-changes__soon" aria-disabled="true">
          {t.versionLinesCompareShort}
          <span className="version-lines-quick-switch__soon">{t.versionLinesSoon}</span>
        </span>
      </div>
      {changes && (
        <p className="version-lines-changes__total">
          <strong>{t.versionLinesChangesFiles(total, formatNumber(total, formats))}</strong>
          <span className="version-lines-changes__added">+{formatNumber(changes.additions, formats)}</span>
          <span className="version-lines-changes__deleted">−{formatNumber(changes.deletions, formats)}</span>
          <span className="version-lines-changes__since">{t.versionLinesChangesSince}</span>
        </p>
      )}
      <div ref={listRef} className="version-lines-changes__list">
        {shown.length > 0 && (
          <ul>
            {shown.map((file) => {
              const { name, folder } = splitPath(file.path);
              const added = file.additions ?? 0;
              const deleted = file.deletions ?? 0;
              const width = Math.max(4, Math.round((BAR_WIDTH * (added + deleted)) / largest));
              const binary = file.additions === null;
              return (
                <li key={file.path}>
                  <span
                    className={`version-lines-changes__glyph version-lines-changes__glyph--${CATEGORY_OF[file.status]}`}
                    aria-hidden="true"
                  >
                    {CHANGE_CATEGORY_ICONS[CATEGORY_OF[file.status]]}
                  </span>
                  <span className="version-lines-changes__path">
                    <span className="version-lines-changes__name">{name}</span>
                    {folder && <span className="version-lines-changes__folder">{folder}</span>}
                  </span>
                  {binary ? (
                    <span className="version-lines-changes__counts">{t.versionLinesChangesBinary}</span>
                  ) : (
                    <span className="version-lines-changes__counts">
                      <span className="version-lines-changes__added">+{formatNumber(added, formats)}</span>{" "}
                      <span className="version-lines-changes__deleted">−{formatNumber(deleted, formats)}</span>
                    </span>
                  )}
                  <span className="version-lines-changes__bar" aria-hidden="true">
                    {!binary && (
                      <span style={{ width }}>
                        <span
                          className="version-lines-changes__bar-added"
                          style={{ width: `${(100 * added) / Math.max(1, added + deleted)}%` }}
                        />
                        <span className="version-lines-changes__bar-deleted" />
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {changes && more > 0 && shown.length > 0 && (
          <p className="version-lines-changes__more">{t.versionLinesChangesMore(more, formatNumber(more, formats))}</p>
        )}
      </div>
    </section>
  );
}
