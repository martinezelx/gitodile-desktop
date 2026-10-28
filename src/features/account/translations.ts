import type { AccountScenario } from "./domain";

export interface AccountCopy {
  accountSettingsTitle: string; accountSettingsSession: string; accountSettingsSignedOut: string;
  accountSettingsSignedOutHint: string; accountSettingsTry: string; accountNextAttempt: string;
  accountReset: string; accountTrySignIn: string; accountSettingsPreview: string;
  accountDemoFree: string; accountDemoPro: string;
  accountTitle: string; accountDemo: string; accountDemoHint: string; accountOptional: string;
  accountSignIn: string; accountSignOut: string; accountBrowserHint: string;
  accountBenefits: readonly string[]; accountWaiting: string; accountCodeHint: string;
  accountSteps: readonly string[]; accountCancel: string; accountReopen: string; accountReopened: string;
  accountPlan: string; accountData: string; accountUnavailable: string; accountSuccess: string;
  accountSuccessDetail: (name: string, pro: boolean) => string;
  accountScenario: string; accountScenarios: Record<AccountScenario, string>;
  accountFailures: Record<"offline" | "unfinished" | "expired", string>;
  accountLocalSafe: string; accountRetry: string; accountNotNow: string;
}
