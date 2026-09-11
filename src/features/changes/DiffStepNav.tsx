import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";

import type { Translations } from "../../i18n";

/** The two arrow pairs a diff surface steps with: previous/next file, and
 * previous/next change inside the open one.
 *
 * Shared rather than copied because History reads the same diffs through the
 * same `DiffResultView` and wants the same controls in the same place — the
 * arrangement it had instead, two labelled buttons in a footer of its own, was
 * a second vocabulary for one job and the only control in the app that sat
 * below the size scale.
 *
 * The position is read, not shown: two counters beside four arrows made this
 * strip a row of numbers, and the file list already says which file is open
 * and where it sits. It stays in the accessibility tree for anyone who cannot
 * see that list, and `0` still means the open file is not in it — a search can
 * narrow the list without changing the selection, and "File 0 of 3" is not a
 * position. The arrows stay (disabled) so the control does not jump in and out
 * while someone types.
 */
export function DiffStepNav({ kind, position, total, onPrevious, onNext, t }: {
  kind: "file" | "hunk";
  /** 1-based, or `0` when what is open is not in the list being stepped. */
  position: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  t: Translations;
}): React.JSX.Element {
  const isFile = kind === "file";
  const Previous = isFile ? ChevronLeft : ArrowUp;
  const Next = isFile ? ChevronRight : ArrowDown;
  const previousLabel = isFile ? t.changesPreviousFile : t.changesPreviousHunk;
  const nextLabel = isFile ? t.changesNextFile : t.changesNextHunk;
  const spoken = isFile ? t.changesFilePosition : t.changesHunkPosition;
  return (
    <div className={`changes-diff__${kind}-nav`}>
      {position > 0 && <span className="visually-hidden">{spoken(position, total)}</span>}
      <button
        type="button"
        className="changes-diff__step"
        aria-label={previousLabel}
        data-tooltip={previousLabel}
        disabled={position <= 1}
        onClick={onPrevious}
      >
        <Previous aria-hidden="true" />
      </button>
      <button
        type="button"
        className="changes-diff__step"
        aria-label={nextLabel}
        data-tooltip={nextLabel}
        disabled={position === 0 || position >= total}
        onClick={onNext}
      >
        <Next aria-hidden="true" />
      </button>
    </div>
  );
}
