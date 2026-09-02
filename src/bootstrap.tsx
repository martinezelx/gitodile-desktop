import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";

import { LanguageProvider } from "./i18n";
import { App } from "./app/App";
import { repairEagerlyStoredDefaults } from "./app/preferences";
import { SwitchMeasurementRoot } from "./app/screens";
import "./styles/fonts.css";

// Repair known defaults before the first render reads any preference.
repairEagerlyStoredDefaults();

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <SwitchMeasurementRoot>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </SwitchMeasurementRoot>
    </React.StrictMode>,
  );
}

// The native window starts hidden. Two frames guarantee that the first app
// content was painted before the desktop shell becomes visible.
if ("__TAURI_INTERNALS__" in window) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void invoke("show_main_window");
    });
  });
}
