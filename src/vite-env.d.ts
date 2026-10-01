/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

/** Version → `YYYY-MM-DD` of its `v<version>` tag, for every highlights file
 * whose tag the building checkout had. A version absent here was not tagged
 * where the build ran and keeps the date written in its highlights file. */
declare const __APP_RELEASE_DATES__: Readonly<Record<string, string>>;

/** Resolved at build time in `vite.config.ts` from the lockfiles and the build
 * machine's toolchain. A layer that could not be resolved is `null`, never a
 * placeholder string: About drops the chip instead of naming a version nobody
 * verified. */
declare const __STACK_VERSIONS__: {
  tauri: string | null;
  react: string | null;
  rust: string | null;
};
