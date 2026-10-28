import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";

import { initialLanguage, LanguageProvider, loadTranslations } from "./i18n";
import { App } from "./app/App";
import { repairEagerlyStoredDefaults } from "./app/preferences";
import { SwitchMeasurementRoot, WindowErrorBoundary } from "./app/screens";
import { startLanguageFade } from "./app/themeTransition";
import "./styles/fonts.css";

// Repair known defaults before the first render reads any preference.
repairEagerlyStoredDefaults();

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

function renderApp(rootElement: HTMLElement): void {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <SwitchMeasurementRoot>
        <LanguageProvider animateLanguageChange={startLanguageFade}>
          <WindowErrorBoundary>
            <App />
          </WindowErrorBoundary>
        </LanguageProvider>
      </SwitchMeasurementRoot>
    </React.StrictMode>,
  );
}

// The native window starts hidden. Two frames guarantee that the first app
// content was painted before the desktop shell becomes visible.
function showWindowAfterPaint(): void {
  if (!("__TAURI_INTERNALS__" in window)) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void invoke("show_main_window");
    });
  });
}

// Only the active language's dictionary is evaluated at launch (task 209); the
// first render waits for it so it never paints keys or another language. A
// dictionary that fails to load falls back to English, and the window is
// shown either way rather than staying hidden.
const rootElement = document.getElementById("root");
const language = initialLanguage();
loadTranslations(language)
  .catch(() => loadTranslations("en"))
  .then(
    () => {
      if (rootElement) renderApp(rootElement);
    },
    () => undefined,
  )
  .finally(showWindowAfterPaint);
