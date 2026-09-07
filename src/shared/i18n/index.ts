/** Public entry point for the shared translation runtime.
 *
 * Holds the copy every feature can need — common actions and the structured
 * error vocabulary — plus the `AppError` contract that turns a Rust failure
 * into one of those strings. Consumers import this file, never a module inside
 * the directory.
 */
export { sharedTranslations, type SharedTranslations } from "./translations";
export { APP_ERROR_CODES, isAppError, localizeAppError, type AppError } from "./appError";
export {
  DATE_FORMATS,
  NUMBER_FORMATS,
  DEFAULT_DATE_FORMAT,
  DEFAULT_NUMBER_FORMAT,
  FORMAT_SAMPLE_DATE,
  FORMAT_SAMPLE_NUMBER,
  formatDate,
  formatNumber,
  formatRelativeTime,
  isDateFormatPreference,
  isNumberFormatPreference,
  type DateFormatPreference,
  type DateStyle,
  type LocaleFormats,
  type NumberFormatPreference,
} from "./formats";
