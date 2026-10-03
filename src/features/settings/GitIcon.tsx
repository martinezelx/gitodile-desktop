import { useId } from "react";

/** The Git logo. Identifies the Git installation, not GitOdile. The mark is
 * Git's: Jason Long's logo, published at
 * https://git-scm.com/downloads/logos and used under its terms (CC BY 3.0);
 * geometry taken from the icon set the app already ships for detected
 * technologies.
 *
 * Drawn in the theme's own ink (`currentColor`), with the branch knocked out
 * through a mask so it reads as the surface behind it — the official logo in
 * GitOdile's style rather than its red, and the same tone as the GitHub mark
 * beside it. Used by the navigation rail and by the installation row's tile. */
const GIT_DIAMOND =
  "M29.472 14.753L17.247 2.528a1.8 1.8 0 0 0-2.55 0l-2.539 2.539l3.22 3.22a2.141 2.141 0 0 1 2.712 2.73l3.1 3.1a2.143 2.143 0 1 1-1.285 1.21l-2.895-2.895v7.617a2.141 2.141 0 1 1-1.764-.062V12.3a2.146 2.146 0 0 1-1.165-2.814l-3.17-3.172L2.528 14.7a1.8 1.8 0 0 0 0 2.551l12.225 12.221a1.8 1.8 0 0 0 2.55 0L29.472 17.3a1.8 1.8 0 0 0 0-2.551";
const GIT_BRANCH =
  "M12.158 5.067l3.22 3.22a2.141 2.141 0 0 1 2.712 2.73l3.1 3.1a2.143 2.143 0 1 1-1.285 1.21l-2.895-2.895v7.617a2.141 2.141 0 1 1-1.764-.062V12.3a2.146 2.146 0 0 1-1.165-2.814l-3.17-3.172";

export function GitIcon(): React.JSX.Element {
  const maskId = `${useId()}-git`;
  return (
    <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true" focusable="false">
      <mask id={maskId}>
        <rect width="32" height="32" fill="#000000" />
        <path d={GIT_DIAMOND} fill="#ffffff" />
        <path d={GIT_BRANCH} fill="#000000" />
      </mask>
      <rect width="32" height="32" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}
