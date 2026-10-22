import type { Translations } from "../../i18n";

import type { Branch } from "./domain";

/** Whether this branch can be deleted, decided by the same proof the delete plan
 * requires, so the list can say so up front instead of letting the user find
 * out only after opening the dialog. */
export type Deletability = "ready" | "unique-work" | "elsewhere" | "protected";

export function deletabilityOf(branch: Branch): Deletability {
  // The remote's default branch is where the project's shared work lives, and
  // Rust refuses to delete or rename it. The screen says the same thing rather
  // than offering an action that will be turned down.
  if (branch.isDefault) {
    return "protected";
  }
  if (branch.worktreePath !== null) {
    return "elsewhere";
  }
  return branch.isRetainedElsewhere ? "ready" : "unique-work";
}

/** Names the Delete action, and says *why* it is or is not going to work.
 *
 * One function because there are two surfaces offering it — the detail header
 * and the right-click menu — and they were briefly telling different stories:
 * the menu labelled every Delete "its saved work is already kept somewhere
 * else", which is the opposite of the truth for a branch whose work lives
 * nowhere but there. */
export function deleteActionLabel(branch: Branch, t: Translations, copiedInto?: string | null): string {
  // Held by no other branch, but its work reached the main branch as copies: it
  // can go, with a recovery point for the originals (ADR 0016).
  if (copiedInto && deletabilityOf(branch) === "unique-work") {
    return t.branchesDeleteCopiedTooltip(branch.name, copiedInto);
  }
  switch (deletabilityOf(branch)) {
    case "elsewhere":
      return t.branchesDeleteElsewhereTooltip(branch.name);
    case "unique-work":
      return t.branchesDeleteBlockedTooltip(branch.name);
    default:
      return t.branchesDeleteReadyTooltip(branch.name);
  }
}

/** Which of the three actions apply to one branch.
 *
 * Also written once for both surfaces. A right-click menu that offered what
 * the panel behind it refuses would be two answers to one question, and the
 * only way to keep them in step is for neither to decide it. */
export function branchActions(branch: Branch): {
  canSwitch: boolean;
  canRename: boolean;
  canDelete: boolean;
} {
  const deletability = deletabilityOf(branch);
  const isCheckedOutElsewhere = branch.worktreePath !== null;
  return {
    canSwitch: !branch.isActive && !isCheckedOutElsewhere,
    // Renaming the active branch is fine — Git moves the ref under HEAD and the
    // project stays exactly where it is. Only the default branch is out of
    // bounds, and one another workspace holds: Git would rewrite the ref under
    // that window without telling it.
    canRename: deletability !== "protected" && !isCheckedOutElsewhere,
    canDelete: !branch.isActive && deletability !== "protected" && deletability !== "elsewhere",
  };
}
