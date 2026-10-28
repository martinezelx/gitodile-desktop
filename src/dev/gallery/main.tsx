/**
 * The style gallery: every shared primitive and state, drawn from fixtures in
 * every theme, so a visual change can be checked without Tauri or a project.
 * DESIGN.md § Before designing a screen names it as the reference to match.
 *
 * Development only. `gallery.html` is not a build input, so nothing here
 * reaches the shipped bundle; it lives under `src` so TypeScript keeps it
 * compiling as the primitives change.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import "../../styles.css";
import "../../styles/fonts.css";
import "./gallery.css";
import { loadTranslations } from "../../i18n";
import { Gallery } from "./Gallery";

// The status bar specimen speaks through the app's dictionaries, which the
// first render must find loaded (the same wait `bootstrap.tsx` makes).
const root = document.getElementById("root") as HTMLElement;
loadTranslations("en").then(
  () => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <Gallery />
      </React.StrictMode>,
    );
  },
  (error: unknown) => {
    root.textContent = `The gallery could not load its dictionary: ${String(error)}`;
  },
);
