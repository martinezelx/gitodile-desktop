import { Search, X } from "lucide-react";

/** The one search field a panel strip carries: a pill at the row control tier
 * holding the glyph, the input, a way to empty it, and — optionally — the
 * controls that narrow the same list.
 *
 * ADR 0003's two-consumer bar was passed several times over before this moved:
 * the Changes file list, the History timeline, and the History diff's two
 * boxes had each written the same pill by hand, at three different heights
 * over three different backgrounds.
 *
 * The pill is a `<div>`, where every copy was a `<label>`. A label answers a
 * click anywhere inside it on behalf of its control, which is what makes the
 * glyph focus the input — and also what would swallow a click on the clear
 * button or a trailing filter. The label is the field now, so the glyph keeps
 * that behaviour and the buttons keep their own.
 */
export function SearchBox({
  value,
  placeholder,
  ariaLabel,
  clearLabel,
  className,
  trailing,
  onChange,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  /** Names the clear button. Taken as a prop rather than read from context
   * because nothing in `shared/ui` reaches for the language provider — a
   * primitive here renders what it is handed. */
  clearLabel: string;
  className?: string;
  /** Controls that narrow the same list this box filters, shown inside the
   * pill behind a hairline. Anything acting on something else belongs beside
   * the box, not in it. */
  trailing?: React.ReactNode;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className={className ? `search-box ${className}` : "search-box"}>
      <label className="search-box__field">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {/* Rendered even when there is nothing to clear, and hidden with
          `visibility` rather than dropped from the tree: dropping it would let
          the input grow the moment the first character is typed, which moves
          the text under the caret at exactly the wrong time. `visibility`
          keeps the 24px and still takes the button out of the tab order and
          the accessibility tree. */}
      <button
        className="search-box__clear"
        type="button"
        aria-label={clearLabel}
        data-empty={value.length === 0 || undefined}
        onClick={() => onChange("")}
      >
        <X aria-hidden="true" />
      </button>
      {trailing !== undefined && <span className="search-box__trailing">{trailing}</span>}
    </div>
  );
}
