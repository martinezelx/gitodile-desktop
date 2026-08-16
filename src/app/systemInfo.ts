import { useState } from "react";
import { arch as getArch, platform as getPlatform, version as getVersion } from "@tauri-apps/plugin-os";

/** What the About dialog reports about the machine. Kept as raw values rather
 * than a formatted string so the name and the exact version can be shown on
 * separate rows and the copyable diagnostics can reuse the parts. */
export type SystemInfo = {
  platform: string;
  version: string;
  arch: string;
};

/** Windows reports an NT version, not the name on the box. Windows 11 still
 * says `10.0.x`, so printing the raw string tells a Windows 11 user they are
 * on Windows 10 — the build number is the only thing that separates them.
 * Everything below 22000 on NT 10.0 is Windows 10; NT 6.x maps by minor. */
function windowsRelease(version: string): string | null {
  const [major, minor, build] = version.split(".").map((part) => Number.parseInt(part, 10));
  if (major === 10) {
    return Number.isFinite(build) ? (build >= 22000 ? "11" : "10") : null;
  }
  if (major === 6) {
    return minor === 3 ? "8.1" : minor === 2 ? "8" : minor === 1 ? "7" : null;
  }
  return null;
}

/** The name a user would recognize, with no build numbers in it. macOS already
 * reports its marketing version, so its major is the release. Linux reports a
 * kernel version, which names no distribution — so it stays just "Linux" and
 * the kernel goes on the version row where it cannot be misread. */
export function describePlatform(info: SystemInfo): string {
  switch (info.platform) {
    case "windows": {
      const release = windowsRelease(info.version);
      return release === null ? "Windows" : `Windows ${release}`;
    }
    case "macos": {
      const major = info.version.split(".")[0];
      return major ? `macOS ${major}` : "macOS";
    }
    case "linux":
      return "Linux";
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    default:
      // Passed through rather than hidden: a wrong-looking name in a bug
      // report is more useful than a blank row.
      return info.platform;
  }
}

/** Unlike `locale()`, these three plugin-os functions are **synchronous**: they
 * read a global Tauri injects into the page, and throw outright when it is not
 * there — which is every `pnpm dev` run in a plain browser. An unguarded call
 * takes the whole overlay tree down with it, so the failure is caught here and
 * the About rows are simply absent rather than showing "unknown". */
export function readSystemInfo(): SystemInfo | null {
  try {
    return { platform: getPlatform(), version: getVersion(), arch: getArch() };
  } catch {
    return null;
  }
}

/** Read once per mount. None of these values change while the app is running. */
export function useSystemInfo(): SystemInfo | null {
  const [info] = useState(readSystemInfo);
  return info;
}

/** The block the About dialog puts on the clipboard. Deliberately in English
 * with fixed labels whatever the UI language is: it exists to be pasted into
 * a bug report, where a maintainer has to read it, not the user who copied
 * it. Omits any line it has no real value for. */
export function formatDiagnostics(parts: {
  appVersion: string;
  system: SystemInfo | null;
  gitVersion: string | null;
}): string {
  const lines = [`GitOdrile ${parts.appVersion}`];
  if (parts.system) {
    lines.push(`System: ${describePlatform(parts.system)} (${parts.system.arch})`);
    lines.push(`System version: ${parts.system.version}`);
  }
  if (parts.gitVersion) {
    lines.push(`Git: ${parts.gitVersion}`);
  }
  return lines.join("\n");
}
