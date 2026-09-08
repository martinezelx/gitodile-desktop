import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

import { formatDate, type LocaleFormats } from "../i18n";

/** A calendar day, as `YYYY-MM-DD`.
 *
 * The same shape Git takes and Rust validates, so a value crosses the whole app
 * without being reinterpreted on the way. */
export type CalendarDay = string;

/** Every string this primitive draws. Taken as props, like every other module
 * in `shared/ui`: nothing here reaches for the language provider. Month and
 * weekday names are the exception and are not here — they come from `Intl` with
 * the reader's own language, because a dictionary cannot hold twelve months in
 * every locale the system may be set to. */
export type DateFieldLabels = {
  /** Names the field itself: "From", "Saved after"… */
  field: string;
  /** Shown, and read, while no day is chosen. */
  placeholder: string;
  /** Names the calendar to a screen reader when it opens. */
  calendar: string;
  previousMonth: string;
  nextMonth: string;
  /** When given, the field offers to empty itself. */
  clear?: string;
};

const DAYS_IN_WEEK = 7;
const WEEKS_SHOWN = 6;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A calendar day from its parts.
 *
 * Never `new Date("2026-03-02")`: that is parsed as UTC midnight and is the day
 * before anywhere west of Greenwich, which is how a date picker ends up
 * selecting the day above the one that was clicked. */
export function toDate(day: CalendarDay): Date | null {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return null;
  const parsed = new Date(year, month - 1, date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toCalendarDay(date: Date): CalendarDay {
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const moved = new Date(date);
  moved.setDate(moved.getDate() + days);
  return moved;
}

function addMonths(date: Date, months: number): Date {
  const moved = new Date(date.getFullYear(), date.getMonth() + months, 1);
  // Clamped rather than rolled over: a month back from 31 March is 28 (or 29)
  // February, not 3 March, which is what setMonth alone would give.
  const lastDay = new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate();
  moved.setDate(Math.min(date.getDate(), lastDay));
  return moved;
}

/** Which weekday a week starts on, in the reader's locale.
 *
 * `Intl.Locale` answers this, through two spellings of the same thing depending
 * on the engine's age, and not at all on some. Monday is the fallback: it is
 * what most of the world uses, and being wrong here misaligns a grid rather
 * than misreporting a date. */
function firstDayOfWeek(language: string): number {
  try {
    const locale = new Intl.Locale(language) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
      getWeekInfo?: () => { firstDay?: number };
    };
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;
    // `Intl` counts Monday as 1 and Sunday as 7; `Date` counts Sunday as 0.
    return (info?.firstDay ?? 1) % DAYS_IN_WEEK;
  } catch {
    return 1;
  }
}

function isBefore(day: CalendarDay, limit: CalendarDay | null | undefined): boolean {
  return Boolean(limit) && day < (limit as string);
}

function isAfter(day: CalendarDay, limit: CalendarDay | null | undefined): boolean {
  return Boolean(limit) && day > (limit as string);
}

/** The nearest day inside `min`/`max`.
 *
 * A cursor that lands outside the range is pulled to the end it overshot rather
 * than refused. Refusing was the first cut and it stranded the reader: a `From`
 * opened while `To` holds a past day starts on today, which is outside the
 * range, and a step that will not land is a step that does nothing — no month
 * button, no PageUp, no way to reach the days that *are* choosable. */
function clampDay(day: CalendarDay, min?: CalendarDay | null, max?: CalendarDay | null): CalendarDay {
  if (isBefore(day, min)) return min as string;
  if (isAfter(day, max)) return max as string;
  return day;
}

/** The six weeks a month is drawn in, always six, so the grid does not change
 * height as the reader steps through the year. */
function monthGrid(month: Date, weekStart: number): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() - weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const start = addDays(first, -lead);
  return Array.from({ length: WEEKS_SHOWN }, (_, week) =>
    Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(start, week * DAYS_IN_WEEK + index)),
  );
}

/** The month grid on its own, controlled.
 *
 * Exported beside the field because a calendar is the half worth reusing: a
 * surface that already has a place to put one — a popover of its own, a panel,
 * a range with two of them — needs the grid and not the trigger. */
export function Calendar({ value, formats, labels, min, max, onSelect }: {
  value: CalendarDay | null;
  formats: LocaleFormats;
  labels: Pick<DateFieldLabels, "calendar" | "previousMonth" | "nextMonth">;
  min?: CalendarDay | null;
  max?: CalendarDay | null;
  onSelect: (day: CalendarDay) => void;
}): React.JSX.Element {
  const weekStart = useMemo(() => firstDayOfWeek(formats.language), [formats.language]);
  // One piece of state, and the month on screen is read from it. The month and
  // the cursor cannot disagree that way — the first cut kept both, and moving
  // past the end of a month told the parent to change month, which came back as
  // a new prop and reset the cursor to the 1st, eating the keystroke.
  // Clamped on the way in as well as on every move: a `From` opened while `To`
  // already holds a past day would otherwise start on today, which is outside
  // its own `max`, on a grid where every day is disabled.
  const [cursor, setCursor] = useState<CalendarDay>(
    () => clampDay(value ?? toCalendarDay(new Date()), min, max),
  );
  const cursorDate = toDate(cursor) ?? new Date();
  const monthKey = `${cursorDate.getFullYear()}-${cursorDate.getMonth()}`;
  const month = useMemo(
    () => new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1),
    [monthKey],
  );
  const grid = useMemo(() => monthGrid(month, weekStart), [month, weekStart]);
  const today = toCalendarDay(new Date());
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  });

  const monthName = new Intl.DateTimeFormat(formats.language, {
    month: "long",
    year: "numeric",
  }).format(month);
  const weekdays = useMemo(() => {
    const long = new Intl.DateTimeFormat(formats.language, { weekday: "long" });
    const narrow = new Intl.DateTimeFormat(formats.language, { weekday: "narrow" });
    // Any week will do; this one starts on a Sunday, so the offset from it is
    // the week-start itself.
    return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
      const date = new Date(2024, 0, 7 + ((weekStart + index) % DAYS_IN_WEEK));
      return { long: long.format(date), narrow: narrow.format(date) };
    });
  }, [formats.language, weekStart]);

  const move = (to: Date, byKeyboard: boolean): void => {
    // Pulled to the end it overshot rather than refused, so a month step from
    // April with a `min` of 20 March lands on the 20th instead of doing
    // nothing while eleven choosable days sit one press away.
    const day = clampDay(toCalendarDay(to), min, max);
    shouldFocus.current = byKeyboard;
    setCursor(day);
  };

  // A step whose whole month is out of range: the button says so rather than
  // being pressed and answering nothing.
  const canStep = (months: number): boolean => {
    const target = addMonths(cursorDate, months);
    const first = toCalendarDay(new Date(target.getFullYear(), target.getMonth(), 1));
    const last = toCalendarDay(new Date(target.getFullYear(), target.getMonth() + 1, 0));
    return !isAfter(first, max) && !isBefore(last, min);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const from = cursorDate;
    const weekday = (from.getDay() - weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
    const step = ((): Date | null => {
      switch (event.key) {
        case "ArrowLeft": return addDays(from, -1);
        case "ArrowRight": return addDays(from, 1);
        case "ArrowUp": return addDays(from, -DAYS_IN_WEEK);
        case "ArrowDown": return addDays(from, DAYS_IN_WEEK);
        case "Home": return addDays(from, -weekday);
        case "End": return addDays(from, DAYS_IN_WEEK - 1 - weekday);
        case "PageUp": return addMonths(from, event.shiftKey ? -12 : -1);
        case "PageDown": return addMonths(from, event.shiftKey ? 12 : 1);
        default: return null;
      }
    })();
    if (!step) return;
    event.preventDefault();
    // Stopped as well as prevented: this grid is usually opened from inside a
    // panel that runs its own arrow-key handling, and one press must move one
    // thing.
    event.stopPropagation();
    move(step, true);
  };

  return <div className="date-calendar" role="group" aria-label={labels.calendar}>
    <div className="date-calendar__header">
      <button
        type="button"
        className="date-calendar__step"
        aria-label={labels.previousMonth}
        disabled={!canStep(-1)}
        onClick={() => move(addMonths(cursorDate, -1), false)}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      {/* Announced on change, because stepping the month moves the grid under a
          reader who cannot see it move. */}
      <span className="date-calendar__month" aria-live="polite">{monthName}</span>
      <button
        type="button"
        className="date-calendar__step"
        aria-label={labels.nextMonth}
        disabled={!canStep(1)}
        onClick={() => move(addMonths(cursorDate, 1), false)}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
    <div ref={gridRef} className="date-calendar__grid" role="grid" aria-label={monthName} onKeyDown={handleKeyDown}>
      <div className="date-calendar__week" role="row">
        {weekdays.map((weekday) => (
          <span key={weekday.long} className="date-calendar__weekday" role="columnheader" aria-label={weekday.long} title={weekday.long}>
            {weekday.narrow}
          </span>
        ))}
      </div>
      {grid.map((week) => (
        <div key={toCalendarDay(week[0])} className="date-calendar__week" role="row">
          {week.map((date) => {
            const day = toCalendarDay(date);
            const outside = date.getMonth() !== month.getMonth();
            const disabled = isBefore(day, min) || isAfter(day, max);
            const selected = day === value;
            return <div key={day} role="gridcell" aria-selected={selected}>
              <button
                type="button"
                className={
                  "date-calendar__day"
                  + (outside ? " date-calendar__day--outside" : "")
                  + (selected ? " date-calendar__day--selected" : "")
                  + (day === today ? " date-calendar__day--today" : "")
                }
                // One stop in the grid, wherever the cursor is: a month of
                // buttons in the tab order is a month of tab stops.
                tabIndex={day === cursor ? 0 : -1}
                aria-disabled={disabled || undefined}
                aria-current={day === today ? "date" : undefined}
                aria-label={formatDate(date, formats, "date")}
                onClick={() => { if (!disabled) onSelect(day); }}
              >
                {date.getDate()}
              </button>
            </div>;
          })}
        </div>
      ))}
    </div>
  </div>;
}

/** Where a popup goes, given where its field is.
 *
 * Both edges are the field's, never the window's: the popup hangs from the
 * field's left edge, and from its right edge when the left one would push it
 * past the window — so the two ends of a range mirror each other instead of one
 * of them sliding to wherever it happened to fit. The window only ever has the
 * last word, and only when neither edge works.
 *
 * A pure function because the alternative is measuring a browser: the rule is
 * worth stating once and reading back, and jsdom gives every box zero size. */
export function placePopup(
  field: { top: number; bottom: number; left: number; right: number },
  popup: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
): { top: number; left: number } {
  const fromLeft = field.left;
  const left = fromLeft + popup.width <= viewport.width - margin
    ? Math.max(margin, fromLeft)
    : Math.max(margin, Math.min(field.right - popup.width, viewport.width - popup.width - margin));
  // Under the field, or above it when there is no room under — the same
  // preference, on the other axis.
  const below = field.bottom + 4;
  const top = below + popup.height > viewport.height - margin
    ? Math.max(margin, field.top - popup.height - 4)
    : below;
  return { top, left };
}

/** A day, chosen from a calendar this app draws.
 *
 * Deliberately not `<input type="date">`. That control is the engine's: its
 * popup ignores every token here, changes shape with the WebView version under
 * the app, and writes the date in the operating system's format while the rest
 * of the product writes it in the one the reader chose in Settings. A field
 * showing `03/02/2026` beside a chip showing `2 Mar 2026` is the same date told
 * two ways in one panel.
 *
 * Admitted to `shared/ui` with one consumer rather than the two ADR 0003 asks
 * for — a deliberate, recorded exception (task 120). The bar exists to stop
 * speculative APIs; the argument accepted here is that a calendar's is not
 * speculative, and that the consistency being bought is across machines rather
 * than across screens.
 *
 * Dismissal is its own, and not `useAnchoredPopup`: that hook closes on a
 * document-level Escape, and this field is opened from inside panels that do
 * the same, so one press would close both. Escape is handled in the React tree
 * and stopped there, which is what makes the innermost surface the one that
 * closes. */
export function DateField({ value, formats, labels, min, max, className, onChange }: {
  value: CalendarDay | null;
  formats: LocaleFormats;
  labels: DateFieldLabels;
  min?: CalendarDay | null;
  max?: CalendarDay | null;
  className?: string;
  onChange: (value: CalendarDay | null) => void;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  // Where the calendar is drawn, in viewport coordinates. `null` until it has
  // been measured, which is also what keeps it from being seen at the wrong
  // place for one frame.
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const place = (): void => {
    const field = containerRef.current?.getBoundingClientRect();
    const popup = popupRef.current?.getBoundingClientRect();
    if (!field || !popup) return;
    const next = placePopup(field, popup, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    setPosition((current) =>
      current && current.top === next.top && current.left === next.left ? current : next,
    );
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    place();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      // The calendar is not inside the field in the DOM any more, so "outside"
      // has to mean outside both.
      if (containerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    // A fixed popup does not move with its trigger, so it is placed again
    // rather than dismissed. Dismissing was the first cut and it closed the
    // calendar the instant it opened: focusing the day inside it scrolls an
    // ancestor, which is a scroll like any other.
    // Focus leaving both the field and the calendar closes it too. The popup
    // is the last thing in `document.body`, so tabbing off its final day used
    // to leave it open and floating over the app with nothing focused in it.
    const handleFocusIn = (event: FocusEvent): void => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    // The grid takes focus as it opens, so the arrow keys act on the calendar
    // rather than on whatever the trigger sat inside. Straight away, not on the
    // next frame: the popup is in the same commit as this effect, and a frame's
    // delay is a window in which a key press goes to the wrong place.
    popupRef.current?.querySelector<HTMLElement>('.date-calendar__day[tabindex="0"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen]);

  const shown = value ? formatDate(toDate(value) ?? new Date(), formats, "date") : labels.placeholder;

  return <div ref={containerRef} className={`date-field${className ? ` ${className}` : ""}`}>
    <button
      ref={triggerRef}
      type="button"
      className={`date-field__trigger${value ? " date-field__trigger--set" : ""}`}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={value ? `${labels.field}: ${shown}` : labels.field}
      onClick={() => setIsOpen((open) => !open)}
    >
      <CalendarDays aria-hidden="true" />
      <span className="date-field__value">{shown}</span>
    </button>
    {value && labels.clear && (
      <button
        type="button"
        className="date-field__clear"
        aria-label={labels.clear}
        onClick={() => onChange(null)}
      >
        <X aria-hidden="true" />
      </button>
    )}
    {/* Drawn on `document.body`, not beside the field.
        The panels this field is used from position their own surfaces inside a
        column that clips its overflow — History's timeline does exactly that —
        so an absolutely positioned calendar is cut off at the column's edge
        however it is aligned. Only leaving that subtree fixes it; the price is
        placing it by hand, which is the trade `usePortalFlyout` already makes
        for the same reason.
        Events still reach this component: a React portal bubbles through the
        React tree, not the DOM one, so Escape is handled and stopped here as
        before. */}
    {isOpen && createPortal(
      <div
        ref={popupRef}
        className="date-field__popup"
        role="dialog"
        aria-label={labels.calendar}
        style={position
          ? { top: position.top, left: position.left }
          : { top: 0, left: 0, visibility: "hidden" }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }}
        // Leaving the field's subtree to escape a clipping column also left
        // whatever the field is nested in — a panel that dismisses on a press
        // outside itself now counts this as outside, and closes under the
        // pointer before the day is chosen. The press is kept here: a nested
        // surface is the one that knows it is nested.
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Mounted with the popup, so it opens on the chosen day — or on this
            month when there is none — rather than wherever it was left. */}
        <Calendar
          value={value}
          formats={formats}
          labels={labels}
          min={min}
          max={max}
          onSelect={(day) => { close(true); onChange(day); }}
        />
      </div>,
      document.body,
    )}
  </div>;
}
