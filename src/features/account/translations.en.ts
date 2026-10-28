import type { AccountCopy } from "./translations";

// Only the development composition reads these fields. Keep their type in the
// shared dictionary while letting the production bundler erase demo copy.
export const en: AccountCopy = import.meta.env.DEV ? {
  accountSettingsTitle: "Account", accountSettingsSession: "Your session",
  accountSettingsSignedOut: "No demo session", accountSettingsSignedOutHint: "Try the sign-in flow with a sample account.",
  accountSettingsTry: "Try the account demo", accountNextAttempt: "This result applies to the next attempt. Your session is kept only until the app closes.",
  accountReset: "Reset demo", accountTrySignIn: "Try sign-in",
  accountSettingsPreview: "Development preview. Pro, billing and preference sync are simulated or unavailable. Your project connections stay separate.",
  accountDemoFree: "Free · Demo", accountDemoPro: "Pro · Demo",
  accountTitle: "Your GitOdile account", accountDemo: "Account demo",
  accountDemoHint: "Visual simulation · no browser opens and no data is sent.",
  accountOptional: "Optional. All local work works the same without it.",
  accountSignIn: "Sign in", accountSignOut: "Sign out", accountBrowserHint: "The real sign-in will continue in your browser.",
  accountBenefits: ["Save selected lines and chunks", "File history and authorship", "Preferences across your devices"],
  accountWaiting: "Waiting for the browser…", accountCodeHint: "Match this request code on the sign-in page:",
  accountSteps: ["Browser hand-off simulated", "Sign in and confirm the code", "Return to GitOdile signed in"],
  accountCancel: "Cancel", accountReopen: "Open again", accountReopened: "Browser hand-off simulated again. The request code is unchanged.",
  accountPlan: "Plan and billing", accountData: "What your account stores", accountUnavailable: "Coming soon",
  accountSuccess: "Signed in", accountSuccessDetail: (name, pro) => `Hello, ${name}. ${pro ? "Pro demo is active on this device." : "Your demo session is ready."}`,
  accountScenario: "Demo result", accountScenarios: { success: "Success · Free", pro: "Success · Pro", waiting: "Keep waiting", offline: "No connection", unfinished: "No response", expired: "Request expired", cancelled: "Cancelled" },
  accountFailures: { offline: "Could not connect to GitOdile. Try again when you're online.", unfinished: "No response received from the browser. You can try again.", expired: "This sign-in request expired. Start a new one to continue." },
  accountLocalSafe: "Your projects and saved versions are unaffected.", accountRetry: "Try again", accountNotNow: "Not now",
} : ({} as AccountCopy);
