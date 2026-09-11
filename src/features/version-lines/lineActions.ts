import type { Translations } from "../../i18n";

import type { VersionLine } from "./domain";

/** Whether this line can be deleted, decided by the same proof the delete plan
 * requires, so the list can say so up front instead of letting the user find
 * out only after opening the dialog. */
export type Deletability = "ready" | "unique-work" | "elsewhere" | "protected";

export function deletabilityOf(line: VersionLine): Deletability {
  // The remote's default line is where the project's shared work lives, and
  // Rust refuses to delete or rename it. The screen says the same thing rather
  // than offering an action that will be turned down.
  if (line.isDefault) {
    return "protected";
  }
  if (line.worktreePath !== null) {
    return "elsewhere";
  }
  return line.isRetainedElsewhere ? "ready" : "unique-work";
}

/** Names the Delete action, and says *why* it is or is not going to work.
 *
 * One function because there are two surfaces offering it — the detail header
 * and the right-click menu — and they were briefly telling different stories:
 * the menu labelled every Delete "its saved work is already kept somewhere
 * else", which is the opposite of the truth for a line whose work lives
 * nowhere but there. */
export function deleteActionLabel(line: VersionLine, t: Translations): string {
  switch (deletabilityOf(line)) {
    case "elsewhere":
      return t.versionLinesDeleteElsewhereTooltip(line.name);
    case "unique-work":
      return t.versionLinesDeleteBlockedTooltip(line.name);
    default:
      return t.versionLinesDeleteReadyTooltip(line.name);
  }
}

/** Which of the three actions apply to one line.
 *
 * Also written once for both surfaces. A right-click menu that offered what
 * the panel behind it refuses would be two answers to one question, and the
 * only way to keep them in step is for neither to decide it. */
export function versionLineActions(line: VersionLine): {
  canSwitch: boolean;
  canRename: boolean;
  canDelete: boolean;
} {
  const deletability = deletabilityOf(line);
  const isCheckedOutElsewhere = line.worktreePath !== null;
  return {
    canSwitch: !line.isActive && !isCheckedOutElsewhere,
    // Renaming the active line is fine — Git moves the ref under HEAD and the
    // project stays exactly where it is. Only the default line is out of
    // bounds, and one another workspace holds: Git would rewrite the ref under
    // that window without telling it.
    canRename: deletability !== "protected" && !isCheckedOutElsewhere,
    canDelete: !line.isActive && deletability !== "protected" && deletability !== "elsewhere",
  };
}
