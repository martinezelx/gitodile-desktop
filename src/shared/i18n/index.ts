/** Public entry point for the shared translation runtime.
 *
 * Holds the copy every feature can need — common actions and the structured
 * error vocabulary — plus the `AppError` contract that turns a Rust failure
 * into one of those strings. Consumers import this file, never a module inside
 * the directory.
 */
export { sharedTranslations, type SharedTranslations } from "./translations";
export { APP_ERROR_CODES, isAppError, localizeAppError, type AppError } from "./appError";
