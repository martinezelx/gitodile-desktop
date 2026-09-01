import type React from "react";
import { CloudDownload, CloudUpload, TriangleAlert } from "lucide-react";
import type { NotificationKind } from "./domain";

/** Structural, not lucide's own type: the only thing either call site does with
 * these is render them with `aria-hidden`, and typing them by what is asked of
 * them keeps the icon set replaceable. The prop takes ARIA's own `Booleanish`
 * so `aria-hidden="true"` — how the rest of this app writes it — is accepted
 * alongside the JSX boolean shorthand. */
export type NotificationIcon = React.ComponentType<{
  "aria-hidden"?: boolean | "true" | "false";
}>;

/**
 * The glyph each kind wears, keyed by **kind** rather than by tone.
 *
 * Tone is a colour — three tones will not stay one-to-one with kinds — and a
 * glyph is meaning: two kinds sharing a tone must not be forced to share a
 * cloud pointing the wrong way.
 *
 * It lives here, in the feature that owns the notification, because Settings
 * shows the same three icons beside its explanation of what gets reported and
 * tells the reader in so many words that they are the ones the notification
 * will wear. Two tables would let that promise go quietly false.
 */
export const NOTIFICATION_ICONS: Record<NotificationKind, NotificationIcon> = {
  teamChangesAvailable: CloudDownload,
  remoteCheckFailed: TriangleAlert,
  changesPublished: CloudUpload,
};
