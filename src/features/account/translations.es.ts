import type { AccountCopy } from "./translations";

// Only the development composition reads these fields. Keep their type in the
// shared dictionary while letting the production bundler erase demo copy.
export const es: AccountCopy = import.meta.env.DEV ? {
  accountSettingsTitle: "Cuenta", accountSettingsSession: "Tu sesión",
  accountSettingsSignedOut: "Sin sesión demo", accountSettingsSignedOutHint: "Prueba el inicio de sesión con una cuenta de ejemplo.",
  accountSettingsTry: "Probar la demo de cuenta", accountNextAttempt: "Este resultado se aplica al próximo intento. La sesión solo se conserva hasta cerrar la app.",
  accountReset: "Restablecer demo", accountTrySignIn: "Probar inicio de sesión",
  accountSettingsPreview: "Vista previa de desarrollo. Pro, facturación y sincronización de preferencias están simulados o no disponibles. Las conexiones de tus proyectos son independientes.",
  accountDemoFree: "Free · Demo", accountDemoPro: "Pro · Demo",
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
} : ({} as AccountCopy);
