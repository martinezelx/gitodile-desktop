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
export { RefreshIconButton } from "./refreshIconButton";
export { DialogCloseButton } from "./dialogCloseButton";
export { AutomaticUpdatesNotice } from "./automaticUpdatesNotice";
export { useFieldErrors, FieldError } from "./fieldErrors";
export type { FieldCheck, FieldErrorMap, FieldErrorState } from "./fieldErrors";
export { useAnchoredPopup, usePortalFlyout, handlePopupMenuKeyDown } from "./popupMenu";
export { copyTextToClipboard } from "./clipboard";
