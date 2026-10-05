import type { HostingToolingCopy } from "../settings";
import { useLanguage } from "../../i18n";
export function useGitLabToolingCopy(): HostingToolingCopy {
 const { t } = useLanguage();
 return {
  ghAccountDescription: t.glabAccountDescription,
  ghAccountTitle: t.glabAccountTitle,
  ghActionFailed: t.glabActionFailed,
  ghCheckFailed: t.glabCheckFailed,
  ghChipCheckFailed: t.glabChipCheckFailed,
  ghChipInstalled: t.glabChipInstalled,
  ghChipMissing: t.glabChipMissing,
  ghChipUnusable: t.glabChipUnusable,
  ghDescription: t.glabDescription,
  ghGuidanceOpened: t.glabGuidanceOpened,
  ghInstall: t.glabInstall,
  ghInstallerLaunched: t.glabInstallerLaunched,
  ghInstructions: t.glabInstructions,
  ghMissing: t.glabMissing,
  ghName: t.glabName,
  ghTitle: t.glabTitle,
  ghUnusable: t.glabUnusable,
  ghUpdateCheckFailed: t.glabUpdateCheckFailed,
  ghUpdateCheckTimedOut: t.glabUpdateCheckTimedOut,
  ghUpdateChecking: t.glabUpdateChecking,
  ghUpdateUnavailable: t.glabUpdateUnavailable,
  ghUpdateUpToDate: t.glabUpdateUpToDate,
 };
}
