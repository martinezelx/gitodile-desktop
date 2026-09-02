/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

/** Resolved at build time in `vite.config.ts` from the lockfiles and the build
 * machine's toolchain. A layer that could not be resolved is `null`, never a
 * placeholder string: About drops the chip instead of naming a version nobody
 * verified. */
declare const __STACK_VERSIONS__: {
  tauri: string | null;
  react: string | null;
  typescript: string | null;
  rust: string | null;
};
