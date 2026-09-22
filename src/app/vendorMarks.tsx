import React from "react";
import ReactMark from "~icons/vscode-icons/file-type-reactjs";
import RustMark from "~icons/vscode-icons/file-type-rust";
import TauriMark from "~icons/vscode-icons/file-type-tauri";
import { rawSvgImage } from "../shared/ui/rawSvgImage";
import type { StackLayerId } from "./stack";

/** Third-party brand marks, used in About and nowhere else.
 *
 * `DESIGN.md` § Icons says not to mix a second icon library or hand-drawn
 * glyphs in alongside Lucide. That rule governs *controls* — the vocabulary a
 * user learns to operate the app. These are not controls: they are artwork
 * naming somebody else's product, the same category as the file-type icons the
 * Changes list already renders, and Lucide has no glyph for "Tauri" to reach
 * for. They stay confined to this file and to that one surface.
 *
 * They keep their vendor colours because a logo stripped to one ink stops being
 * a logo, and recognition at this size is the only job it has. That is the
 * trade: About accepts a few fixed colours it does not own, and in exchange
 * nothing else in the app has to. The exception is a mark whose brand colour is
 * an ink rather than a hue — Apple's and Tux's body — which takes the theme's
 * own; see `OperatingSystemMark` below.
 */

/** The stack marks come from the vscode-icons collection (MIT) already
 * installed for file types, so nothing is redrawn by hand and nothing new is
 * added to the dependency list. Rendered as images because Rust's gear carries
 * a gradient with an internal ID; see `shared/ui/rawSvgImage.ts`. */
const STACK_MARKS: Record<StackLayerId, string> = {
  tauri: TauriMark,
  react: ReactMark,
  rust: RustMark,
};

export function StackMark({ layer }: { layer: StackLayerId }): React.JSX.Element {
  const Mark = rawSvgImage(STACK_MARKS[layer]);
  return <Mark className="about-stack__mark" />;
}

/** The operating-system marks are drawn here rather than pulled from a set:
 * vscode-icons has no Windows, Apple or Tux artwork, and these three are the
 * whole list — the app runs on nothing else.
 *
 * Inline rather than through the image adapter, because two of the three need
 * the theme's own ink: Apple's mark is monochrome by its own brand definition,
 * and Tux's body is black, which is a hole in the layout on the dark dialog
 * surface. Inline SVG lets both inherit `currentColor` and be right in either
 * theme for free. Windows keeps its blue, legible against both. */
type MarkProps = { className?: string };

/** Four panes, the post-2012 mark. The tilted flag is a different logo and a
 * much older product. */
function WindowsMark({ className }: MarkProps): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#0078d4" aria-hidden="true">
      <path d="M0 3.449 9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

function AppleMark({ className }: MarkProps): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.54c-.02-2.68 2.19-3.97 2.29-4.03-1.25-1.82-3.19-2.07-3.88-2.1-1.65-.17-3.22.97-4.06.97-.83 0-2.12-.94-3.49-.92-1.8.03-3.45 1.05-4.38 2.66-1.87 3.23-.48 8.02 1.34 10.65.89 1.28 1.95 2.73 3.34 2.68 1.33-.06 1.84-.87 3.46-.87 1.61 0 2.07.87 3.48.84 1.44-.03 2.35-1.31 3.23-2.6 1.02-1.49 1.44-2.93 1.46-3.01-.03-.01-2.8-1.07-2.83-4.27M14.47 4.66c.74-.9 1.24-2.14 1.1-3.38-1.06.04-2.35.71-3.12 1.6-.68.79-1.28 2.06-1.12 3.28 1.19.09 2.4-.61 3.14-1.5" />
    </svg>
  );
}

/** Tux, simplified. The canonical artwork carries detail that turns to mush at
 * 14px anyway; what has to survive at this size is the silhouette, the belly
 * and the yellow beak, which is what reads as "Linux".
 *
 * Body and belly are the theme's ink and the dialog's own surface rather than
 * fixed black and white, for the same reason Apple's mark inherits
 * `currentColor`: a black-bodied penguin on the dark dialog surface is a hole
 * in the layout, not a logo. On dark it reads as an inverted Tux — silhouette
 * intact, beak still yellow, which is the part doing the identifying. */
function LinuxMark({ className }: MarkProps): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1.4c3.2 0 5.4 2.5 5.4 5.9 0 1.4-.2 2.3.5 3.4 1.3 2 2.6 4 2.6 6.6 0 3.6-3.6 5.3-8.5 5.3s-8.5-1.7-8.5-5.3c0-2.6 1.3-4.6 2.6-6.6.7-1.1.5-2 .5-3.4 0-3.4 2.2-5.9 5.4-5.9Z"
      />
      <ellipse cx="12" cy="15.6" rx="4.3" ry="5.4" fill="var(--surface-raised)" />
      <ellipse cx="10.1" cy="6.8" rx="1.5" ry="1.9" fill="var(--surface-raised)" />
      <ellipse cx="13.9" cy="6.8" rx="1.5" ry="1.9" fill="var(--surface-raised)" />
      <ellipse cx="10.4" cy="7.1" rx=".8" ry="1" fill="currentColor" />
      <ellipse cx="13.6" cy="7.1" rx=".8" ry="1" fill="currentColor" />
      <path fill="#f5bd0c" d="M12 8.3c1.2 0 2.1.7 2.1 1.5s-.9 1.5-2.1 1.5-2.1-.7-2.1-1.5.9-1.5 2.1-1.5Z" />
      <path
        fill="#f5bd0c"
        d="M8.5 20.4c.6-.3 1.5-.1 1.8.5.3.6-.3 1.2-1.2 1.5s-1.9.2-2.2-.4c-.3-.6 1-1.3 1.6-1.6Zm7 0c-.6-.3-1.5-.1-1.8.5-.3.6.3 1.2 1.2 1.5s1.9.2 2.2-.4c.3-.6-1-1.3-1.6-1.6Z"
      />
    </svg>
  );
}

/** `null` for anything else, so an unrecognized platform shows its name with no
 * mark rather than a stand-in for an OS the user is not running. */
export function OperatingSystemMark({ platform }: { platform: string }): React.JSX.Element | null {
  switch (platform) {
    case "windows":
      return <WindowsMark className="about-details__mark" />;
    case "macos":
      return <AppleMark className="about-details__mark" />;
    case "linux":
      return <LinuxMark className="about-details__mark" />;
    default:
      return null;
  }
}
