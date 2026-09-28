import type { Translations } from "../../i18n";
import type { SaveVersionPreview } from "./domain";

/** What a plan says beyond its counts, and only when it applies: files the
 * selection leaves behind, changes already prepared in Git's index, a first
 * version, a save with no line to land on (a detached `HEAD`, which is exactly
 * what the reader needs told before they make the commit rather than after).
 *
 * One list for both frames — the dialog prints every line, the quick box the
 * same lines under its one-line plan — so the two never explain the same plan
 * differently. The always-true "local only" note is not here: the dialog
 * states it, the box says it with its publish option.
 *
 * `countStated` is for a frame whose plan line already reads "3 of 7 files":
 * the files left behind are that line's to say, and nothing is counted twice. */
export function getSaveVersionNotes(
  plan: SaveVersionPreview,
  t: Translations,
  { countStated = false }: { countStated?: boolean } = {},
): string[] {
  const notes: string[] = [];
  if (plan.remainingFiles > 0 && !countStated) notes.push(t.saveVersionRemainingNote(plan.remainingFiles));
  if (plan.hasPreparedChanges) notes.push(t.saveVersionPreparedNote);
  if (plan.isFirstVersion) {
    notes.push(plan.branch ? t.saveVersionFirstVersionOnLineNote(plan.branch) : t.saveVersionFirstVersionNote);
  }
  if (!plan.branch) notes.push(t.saveVersionNoDestinationNote);
  return notes;
}
