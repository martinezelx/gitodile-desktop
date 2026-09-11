import React from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateField, placePopup, toCalendarDay, toDate } from "./datePicker";
import type { LocaleFormats } from "../i18n";

const labels = {
  field: "From",
  placeholder: "Any day",
  calendar: "Choose a day",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  clear: "Clear",
};

function formats(overrides: Partial<LocaleFormats> = {}): LocaleFormats {
  return { language: "en", dateFormat: "iso", numberFormat: "system", ...overrides };
}

function renderField(props: Partial<React.ComponentProps<typeof DateField>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <DateField
      value={props.value ?? null}
      formats={props.formats ?? formats()}
      labels={labels}
      min={props.min}
      max={props.max}
      onChange={props.onChange ?? onChange}
    />,
  );
  return { onChange, ...utils };
}

async function openCalendar(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^From/ }));
}

afterEach(cleanup);

describe("toDate", () => {
  it("reads a calendar day as that day, not as UTC midnight", () => {
    // `new Date("2026-03-02")` is midnight UTC, which is 1 March anywhere west
    // of Greenwich — how a picker ends up selecting the day above the one that
    // was clicked. The parts are read instead.
    const date = toDate("2026-03-02");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(2);
    expect(toCalendarDay(date!)).toBe("2026-03-02");
    expect(toDate("nonsense")).toBeNull();
  });
});

describe("placePopup", () => {
  const popup = { width: 276, height: 300 };
  const viewport = { width: 460, height: 900 };
  const field = (left: number, right: number) => ({ left, right, top: 400, bottom: 426 });

  it("hangs from the field's left edge when there is room", () => {
    expect(placePopup(field(40, 200), popup, viewport).left).toBe(40);
  });

  it("hangs from the field's right edge when the left one would overhang", () => {
    // The two ends of a range mirror each other: the second one lines up its
    // right edge with the field's, rather than sliding to wherever it fits.
    const second = field(240, 432);
    expect(placePopup(second, popup, viewport).left).toBe(432 - 276);
  });

  it("falls back to the window only when neither edge works", () => {
    // A field narrower than the popup and hard against the right: neither its
    // left nor its right edge can hold the calendar inside, so the window has
    // the last word.
    expect(placePopup(field(430, 452), popup, viewport).left).toBe(460 - 276 - 8);
    // And hard against the left, the margin does.
    expect(placePopup(field(2, 30), popup, { width: 200, height: 900 }).left).toBe(8);
  });

  it("sits under the field, and above it when there is no room under", () => {
    expect(placePopup(field(40, 200), popup, viewport).top).toBe(430);
    const low = { left: 40, right: 200, top: 700, bottom: 726 };
    expect(placePopup(low, popup, viewport).top).toBe(700 - 300 - 4);
  });
});

describe("DateField", () => {
  it("says what it holds, in the format the reader chose", () => {
    const iso = renderField({ value: "2026-03-02" });
    expect(screen.getByRole("button", { name: "From: 2026-03-02" })).toBeInTheDocument();
    cleanup();

    // The same day, written the way this reader writes days — which is the
    // whole reason this is not a native date input.
    iso.unmount();
    renderField({ value: "2026-03-02", formats: formats({ dateFormat: "day-first" }) });
    expect(screen.getByRole("button", { name: "From: 02/03/2026" })).toBeInTheDocument();
  });

  it("reads as empty, and offers no way to clear what is not there", () => {
    renderField();
    expect(screen.getByRole("button", { name: "From" })).toHaveTextContent("Any day");
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("chooses a day from the calendar and closes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: "2026-03-10" });

    await openCalendar();
    const dialog = screen.getByRole("dialog", { name: "Choose a day" });
    expect(within(dialog).getByText("March 2026")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "2026-03-02" }));
    expect(onChange).toHaveBeenCalledWith("2026-03-02");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves a day, a week and a month with the keyboard, and selects on Enter", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: "2026-03-10" });
    await openCalendar();

    // Opening puts the cursor on the chosen day, so the arrows have somewhere
    // to start from.
    expect(screen.getByRole("button", { name: "2026-03-10" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "2026-03-11" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "2026-03-18" })).toHaveFocus();
    await user.keyboard("{Home}");
    // The week's first day in this locale, which starts weeks on Sunday.
    expect(screen.getByRole("button", { name: "2026-03-15" })).toHaveFocus();

    await user.keyboard("{PageDown}");
    expect(screen.getByRole("button", { name: "2026-04-15" })).toHaveFocus();
    expect(screen.getByText("April 2026")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-04-15");
  });

  it("carries the cursor across a month boundary instead of dropping it", async () => {
    const user = userEvent.setup();
    renderField({ value: "2026-03-31" });
    await openCalendar();

    // The bug this guards: the month and the cursor were two pieces of state,
    // so crossing the boundary told the parent to change month, which came back
    // as a new prop and reset the cursor to the 1st — eating the keystroke.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "2026-04-01" })).toHaveFocus();
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("will not step onto a day outside the range it was given", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: "2026-03-06", min: "2026-03-05" });
    await openCalendar();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "2026-03-05" })).toHaveFocus();
    // The first day of the range is a wall, not a step to somewhere earlier.
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "2026-03-05" })).toHaveFocus();

    const earlier = screen.getByRole("button", { name: "2026-03-04" });
    expect(earlier).toHaveAttribute("aria-disabled", "true");
    await user.click(earlier);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens inside the range when today is outside it", async () => {
    const user = userEvent.setup();
    // The reader filled the far end of a range first, so this field's `max` is
    // a past day and today — where the cursor used to start — is outside it.
    // The whole grid was disabled and every step refused, which left no way to
    // reach the days that *are* choosable.
    renderField({ value: null, max: "2026-03-25" });
    await openCalendar();

    expect(screen.getByText("March 2026")).toBeInTheDocument();
    const last = screen.getByRole("button", { name: "2026-03-25" });
    expect(last).not.toHaveAttribute("aria-disabled");
    expect(last).toHaveAttribute("tabindex", "0");

    await user.click(last);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pulls a month step into the range instead of refusing it", async () => {
    const user = userEvent.setup();
    renderField({ value: "2026-04-10", min: "2026-03-20" });
    await openCalendar();

    // The same day one month back is 10 March, which is before `min` — but 20
    // to 31 March are choosable, so the step lands on the nearest of them
    // rather than doing nothing.
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2026-03-20" })).toHaveAttribute("tabindex", "0");

    // And February has no choosable day at all, so its control says so rather
    // than answering nothing when pressed.
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
  });

  it("closes when focus leaves it altogether", async () => {
    const user = userEvent.setup();
    render(<>
      <DateField value="2026-03-10" formats={formats()} labels={labels} onChange={vi.fn()} />
      <button type="button">Elsewhere</button>
    </>);

    await user.click(screen.getByRole("button", { name: /^From/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // The popup is the last thing in `document.body`, so tabbing off its final
    // day used to leave it open and floating with nothing focused inside it.
    act(() => { screen.getByRole("button", { name: "Elsewhere" }).focus(); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("steps the month from its own controls without choosing anything", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: "2026-03-10" });
    await openCalendar();

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("February 2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on Escape, gives focus back, and keeps the press to itself", async () => {
    const user = userEvent.setup();
    const outerEscape = vi.fn();
    render(
      <div onKeyDown={(event) => { if (event.key === "Escape") outerEscape(); }}>
        <DateField value="2026-03-10" formats={formats()} labels={labels} onChange={vi.fn()} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /^From/ }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /^From/ })).toHaveFocus();
    // A field opened from inside a panel that closes on Escape must not close
    // the panel too: one press, the innermost surface.
    expect(outerEscape).not.toHaveBeenCalled();
  });

  it("empties itself when asked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: "2026-03-10" });
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("names the weekdays and the month in the reader's language", async () => {
    renderField({ value: "2026-03-10", formats: formats({ language: "es" }) });
    await openCalendar();

    expect(screen.getByText("marzo de 2026")).toBeInTheDocument();
    // Spanish weeks start on Monday, English ones on Sunday: the grid follows
    // the locale rather than a hardcoded order.
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0]).toHaveAttribute("aria-label", "lunes");
  });
});
