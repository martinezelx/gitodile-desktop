import { CATEGORY_ORDER, type WorkingTreeEntry } from "../status";

/** How many files the Overview preview names before deferring to the Changes
 * screen: six rows, which is about the height of the Recent history card beside
 * it and about what a card can show before it stops being a summary and
 * starts being the Changes screen with less on it. */
export const CHANGES_PREVIEW_LIMIT = 6;

/** The files the preview names, chosen one category at a time in
 * `CATEGORY_ORDER` — a project with seven edited files and one new one shows
 * the new one, because the sample exists to turn "7 edited, 1 new" into
 * *which*, and a first-N slice would spend the whole budget on the edited
 * ones. The picked rows are then listed in category order, so what the chips
 * above say first is what the list says first too. */
export function sampleChangesPreview(entries: readonly WorkingTreeEntry[], limit: number): WorkingTreeEntry[] {
  const queues = CATEGORY_ORDER.map((category) => entries.filter((entry) => entry.category === category));
  const picked: WorkingTreeEntry[][] = queues.map(() => []);
  let pickedCount = 0;
  let round = 0;
  while (pickedCount < limit) {
    let progressed = false;
    for (let index = 0; index < queues.length && pickedCount < limit; index += 1) {
      const entry = queues[index][round];
      if (!entry) continue;
      picked[index].push(entry);
      pickedCount += 1;
      progressed = true;
    }
    if (!progressed) break;
    round += 1;
  }
  return picked.flat();
}
