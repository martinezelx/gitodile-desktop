import { useLanguage } from "../../i18n";
import type { TokenConnectionCopy } from "../accounts";

/** Token form/row copy for github.com, or for one GitHub Enterprise Server. */
export function useGitHubTokenCopy(server?: { host: string }): TokenConnectionCopy {
  const { t } = useLanguage();
  return {
    connect: t.githubTokenConnect,
    connected: t.githubTokenConnected,
    exists: t.githubTokenExists,
    label: t.githubTokenLabel,
    limit: t.githubTokenLimit,
    limitReached: t.githubTokenLimitReached,
    permissions: server ? t.githubTokenServerPermissions : t.githubTokenPermissions,
    permissionsTitle: t.githubTokenPermissionsTitle,
    removalConsent: t.githubTokenRemovalConsent,
    removalTitle: t.githubTokenRemovalTitle,
    remove: t.githubTokenRemove,
    removed: t.githubTokenRemoved,
    storage: t.githubTokenStorage,
    title: server ? t.githubTokenServerTitle.replace("{host}", server.host) : t.githubTokenTitle,
    failed: t.githubAuthStatus.failed, checking: t.githubAuthStatus.checking, chips: t.githubAuthChip,
  };
}
