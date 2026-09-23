import type React from "react";
import {
  Bug,
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

/** The glyph catalogue. The release scripts validate every highlights file
 * against `docs/release/highlights/icons.json`; this list is the same names
 * as literal types, so the icon map below is complete by construction, and a
 * test holds the two lists equal so neither can grow without the other. */
export const HIGHLIGHT_ICONS = [
  "bug",
  "cloud-download",
  "folder-open",
  "git-branch",
  "history",
  "list-checks",
  "send",
  "shield-check",
  "sparkles",
  "tag",
] as const;
export type HighlightIcon = (typeof HIGHLIGHT_ICONS)[number];

/** One line of a release's highlights, in both languages the app speaks.
 * `icon` is a plain string because a highlight can also arrive from the
 * update feed, written by a newer release that may know glyphs this build
 * does not; an unknown name draws the generic sparkle rather than nothing. */
export type ReleaseHighlightLine = Readonly<{
  id: string;
  icon: string;
  en: string;
  es: string;
}>;

/** `Record<HighlightIcon, …>` is what keeps this complete: a name added to
 * the catalogue without a glyph here fails to compile rather than rendering
 * nothing. */
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

function glyphFor(icon: string): React.ComponentType<{ "aria-hidden": true }> {
  return (HIGHLIGHT_ICONS as readonly string[]).includes(icon)
    ? HIGHLIGHT_ICON_COMPONENTS[icon as HighlightIcon]
    : Sparkles;
}

/** A release's highlights as What's new draws them: one tinted glyph and one
 * sentence per line, in the reader's language. What's new lists the bundled
 * releases and the update dialog lists the offered one; both say the same
 * thing about a version, so they draw it the same way. `role="list"` because
 * the list drops `list-style`, and WebKit removes list semantics with it. */
export function ReleaseHighlights({
  highlights,
  language,
  id,
  className,
}: {
  highlights: readonly ReleaseHighlightLine[];
  language: "en" | "es";
  id?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <ul id={id} className={`release-highlights${className ? ` ${className}` : ""}`} role="list">
      {highlights.map((highlight) => {
        const Glyph = glyphFor(highlight.icon);
        return (
          <li key={highlight.id}>
            <span className="release-highlights__icon" aria-hidden="true"><Glyph aria-hidden /></span>
            <span>{highlight[language]}</span>
          </li>
        );
      })}
    </ul>
  );
}
