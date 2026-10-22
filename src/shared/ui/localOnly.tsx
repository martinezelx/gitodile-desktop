import type React from "react";
import { Cloud, CloudUpload, Laptop } from "lucide-react";

/** "Only on this computer", drawn once for every screen that says it, so a
 * change to its glyph or colour reaches Overview, History and Branches together.
 * The colour is `--tone-local` (themes.css; glyph tones in tokens.css).
 *
 * The icon a row or a fact wears: this computer. */
export function LocalOnlyIcon(): React.JSX.Element {
  return <Laptop aria-hidden="true" />;
}

/** Where a timeline's versions stand, as a chip on its rail: "On this
 * computer" over the versions saved here but not published (the Publish
 * glyph in the local tone; a laptop in the unsaved colour with nowhere to
 * publish), and "Published" where the remote's copy begins (a cloud in the
 * remote's blue). The host places it so the glyph sits over its rail;
 * `compact` is the denser size Branches uses. With `button`, the chip is a
 * button — History's, which folds its block — and `children` follow the
 * label (a count, a chevron). */
export function TimelineChip({
  kind,
  label,
  title,
  compact = false,
  className,
  button,
  children,
}: {
  kind: "local" | "noRemote" | "published";
  label: string;
  /** The remote, and its branch when it differs, for "Published". */
  title?: string;
  compact?: boolean;
  className?: string;
  button?: React.ButtonHTMLAttributes<HTMLButtonElement> & { "aria-level"?: number };
  children?: React.ReactNode;
}): React.JSX.Element {
  const classes = `timeline-chip timeline-chip--${kind}${compact ? " timeline-chip--compact" : ""}${button ? " timeline-chip--button" : ""}${className ? ` ${className}` : ""}`;
  const content = (
    <>
      {kind === "published" ? <Cloud aria-hidden="true" /> : kind === "noRemote" ? <Laptop aria-hidden="true" /> : <CloudUpload aria-hidden="true" />}
      {label}
      {children}
    </>
  );
  return button
    ? <button type="button" className={classes} title={title} {...button}>{content}</button>
    : <span className={classes} title={title}>{content}</span>;
}
