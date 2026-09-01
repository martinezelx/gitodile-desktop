import type React from "react";

/** Arrow keys move focus between the options of a radio group, with Home and
 * End reaching the ends, so a group is one Tab stop rather than one per option.
 *
 * Focus deliberately does not carry the selection with it. The ARIA radio
 * pattern usually selects as focus moves, which is fine when the choice is free
 * — but several of these groups write to a Git configuration on every change,
 * and arrowing past an option is not a decision to change it. Space and Enter
 * activate, which buttons already do.
 *
 * Shared because both settings panels navigate their groups this way; a second
 * copy is how two panels start behaving differently under the same keys.
 *
 * Reads the DOM rather than holding refs: the group is the event target's own
 * container, so this works for any number of options without per-group state. */
export function moveFocusWithinRadioGroup(event: React.KeyboardEvent<HTMLDivElement>): void {
  const step =
    event.key === "ArrowDown" || event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : 0;
  const isEnd = event.key === "End";
  if (step === 0 && !isEnd && event.key !== "Home") {
    return;
  }
  const options = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
  );
  const current = options.indexOf(document.activeElement as HTMLButtonElement);
  if (options.length === 0 || current < 0) {
    return;
  }
  event.preventDefault();
  const next =
    step !== 0 ? (current + step + options.length) % options.length : isEnd ? options.length - 1 : 0;
  options[next].focus();
}
