import type React from "react";
import { CloudUpload, Laptop } from "lucide-react";

/** "Only on this computer", drawn once for every screen that says it, so a
 * change to its glyph or colour reaches Overview, History and Lines together.
 * The colour is `--tone-local` (themes.css; glyph tones in tokens.css).
 *
 * The icon a row or a fact wears: this computer. */
export function LocalOnlyIcon(): React.JSX.Element {
  return <Laptop aria-hidden="true" />;
}

/** The disc that heads a block of versions saved here but not published: the
 * status bar's Publish glyph, since publishing is what they wait for. With
 * nowhere to publish (`noRemote`) it stays this computer. The host places it
 * through `className`; the disc and its tone are the same everywhere. */
export function LocalOnlyMark({ className, noRemote = false }: { className?: string; noRemote?: boolean }): React.JSX.Element {
  return (
    <span className={`local-only-mark${className ? ` ${className}` : ""}`} aria-hidden="true">
      {noRemote ? <Laptop /> : <CloudUpload />}
    </span>
  );
}
