import { Search, X } from "lucide-react";

import type { Translations } from "../../i18n";

/** The find control both diff surfaces carry: a magnifier at rest, and — once
 * opened — a search pill whose one X closes it again.
 *
 * Shared rather than copied because Changes and History read the same diffs and
 * want the same control in the same place. The box is the shared `.search-box`,
 * but its trailing control ends the find rather than emptying it: a filter's
 * clear and a find's close would be two Xs beside each other, and the second is
 * the one the reader reaches for when they are done.
 *
 * The query is owned by the host, so switching files does not have to reset it
 * unless the host says so, and the highlight is applied by `DiffResultView`. */
export function DiffFind({ isOpen, query, onQueryChange, onOpen, onClose, t }: {
  isOpen: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onOpen: () => void;
  onClose: () => void;
  t: Translations;
}): React.JSX.Element {
  if (!isOpen) {
    return (
      <button
        className="changes-diff__step"
        type="button"
        aria-label={t.changesSearchDiffAriaLabel}
        data-tooltip={t.changesSearchDiffAriaLabel}
        onClick={onOpen}
      >
        <Search aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className="changes-diff-find">
      <div className="search-box changes-diff-find__box">
        <label className="search-box__field">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={t.changesSearchDiffPlaceholder}
            aria-label={t.changesSearchDiffAriaLabel}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <button className="search-box__clear" type="button" aria-label={t.commonClose} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
