/** Public entry point for behavior-free UI primitives.
 *
 * ADR 0003 admits a primitive here only after two real consumers share the same
 * stable requirement; every export below passed that bar before it moved.
 * Consumers import this file, never a module inside the directory —
 * `pnpm run check:architecture` fails a deep import.
 *
 * `getFocusableElements` stays internal to `modalFocus`: it has no consumer
 * outside its own module, and exporting it would invite callers to reimplement
 * the focus trap instead of using it.
 *
 * `tooltip` stays internal for a different reason: the app shell mounts
 * `TooltipHost` once and nothing else imports it, so re-exporting it here would
 * only risk pulling the portal into every lazy feature chunk that touches this
 * barrel.
 */
export { autoHideScrollbarProps } from "./autoHideScrollbar";
export { useModalFocus } from "./modalFocus";
export { LoadingBar } from "./loadingBar";
export { SearchBox } from "./searchBox";
export { RefreshIconButton } from "./refreshIconButton";
export { DialogCloseButton } from "./dialogCloseButton";
export { moveFocusWithinRadioGroup } from "./radioGroup";
export { AutomaticUpdatesNotice } from "./automaticUpdatesNotice";
export { useFieldErrors, FieldError } from "./fieldErrors";
export type { FieldCheck, FieldErrorMap, FieldErrorState } from "./fieldErrors";
export { useAnchoredPopup, usePortalFlyout, handlePopupMenuKeyDown } from "./popupMenu";
/* ADR 0003's two-consumer bar, passed twice: the Changes file list and its
   diff shared one right-click menu, History borrowed the whole component to
   get its behaviour, and the version-lines list needed the same mechanics for
   entirely different items. The surface is shared; the items never were. */
export { ContextMenuSurface, contextMenuAnchorFrom, type ContextMenuAnchor } from "./contextMenu";
/* Admitted with one consumer rather than ADR 0003's two, deliberately and on
   the record (task 120). The bar exists to stop a speculative API being fixed
   by a single caller; the argument accepted here is that a calendar's API is
   not speculative, and that what a native `<input type="date">` costs is not a
   second screen's tidiness but consistency across machines — its popup takes
   none of this app's tokens, changes with the WebView version underneath it,
   and writes the date in the operating system's format while everything else
   writes it in the one the reader chose. */
export { Calendar, DateField, placePopup, toCalendarDay, toDate, type CalendarDay, type DateFieldLabels } from "./datePicker";
/* ADR 0003's two-consumer bar (task 121): History built the whole visual
   vocabulary of a filter — the trigger with its count, the anchored panel, the
   capsule groups, the switches, the footer and the chips — and the Changes file
   list needs exactly that vocabulary to ask an entirely different question of
   its own list. What is shared is the surface; what is filtered stays with the
   screen that knows what its rows are. */
export {
  FilterPanel, FilterGroup, FilterCapsules, FilterCapsule, FilterSwitch, FilterChips,
  type FilterPanelLabels, type FilterChip,
} from "./filterPanel";
export { copyTextToClipboard } from "./clipboard";
export { isReducedMotionRequested } from "./motionPreference";
/* ADR 0003's two-consumer bar: the project switcher had this to itself until
   the welcome screen's recent-projects list needed the same identity — same
   colour, same initials, for the same project. */
export { avatarColorVar, avatarInitials } from "./projectAvatar";
