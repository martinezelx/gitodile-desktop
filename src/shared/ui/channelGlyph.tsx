import { FlaskConical } from "lucide-react";

/** The mark a preview build wears beside its version. The version string
 * already names the channel (`v0.2.0-preview.12`), so a textual `preview`
 * pill only said it twice; the glyph is the at-a-glance cue and adds no
 * words. It is decorative: every surface that shows it names the channel in
 * its own accessible label or visible text. Stable builds draw nothing. */
export function ChannelGlyph({ channel }: { channel: "stable" | "preview" }): React.JSX.Element | null {
  if (channel !== "preview") return null;
  return <FlaskConical className="channel-glyph" aria-hidden="true" />;
}
