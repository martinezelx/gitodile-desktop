import type { AccountScenario } from "./domain";

interface AccountCopy {
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

// Only the development composition reads these fields. Keep their type in the
// shared dictionary while letting the production bundler erase demo copy.
export const accountTranslations: { en: AccountCopy; es: AccountCopy } = import.meta.env.DEV ? {
  en: {
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
  },
  es: {
    accountTitle: "Tu cuenta de GitOdile", accountDemo: "Demo de cuenta",
    accountDemoHint: "Simulación visual · no se abre el navegador ni se envían datos.",
    accountOptional: "Opcional. Todo lo local funciona igual sin ella.",
    accountSignIn: "Iniciar sesión", accountSignOut: "Cerrar sesión", accountBrowserHint: "El inicio de sesión real continuará en tu navegador.",
    accountBenefits: ["Guardar por líneas y trozos", "Historial de archivo y autoría", "Preferencias en todos tus equipos"],
    accountWaiting: "Esperando al navegador…", accountCodeHint: "Comprueba que ves este código en la página:",
    accountSteps: ["Apertura del navegador simulada", "Inicia sesión y confirma el código", "Vuelves a GitOdile con la sesión iniciada"],
    accountCancel: "Cancelar", accountReopen: "Abrir de nuevo", accountReopened: "Apertura del navegador simulada de nuevo. El código no ha cambiado.",
    accountPlan: "Plan y facturación", accountData: "Qué datos guarda tu cuenta", accountUnavailable: "Próximamente",
    accountSuccess: "Sesión iniciada", accountSuccessDetail: (name, pro) => `Hola, ${name}. ${pro ? "La demo Pro está activa en este equipo." : "Tu sesión de demostración está lista."}`,
    accountScenario: "Resultado de la demo", accountScenarios: { success: "Éxito · Free", pro: "Éxito · Pro", waiting: "Mantener en espera", offline: "Sin conexión", unfinished: "Sin respuesta", expired: "Solicitud caducada", cancelled: "Cancelado" },
    accountFailures: { offline: "No hay conexión con GitOdile. Vuelve a intentarlo cuando tengas red.", unfinished: "No recibimos respuesta del navegador. Puedes volver a intentarlo.", expired: "Esta solicitud ha caducado. Inicia una nueva para continuar." },
    accountLocalSafe: "Tus proyectos y tus versiones guardadas siguen igual.", accountRetry: "Reintentar", accountNotNow: "Ahora no",
  },
} : { en: {} as AccountCopy, es: {} as AccountCopy };
