import { useLanguage } from "../../i18n";
import type { TokenConnectionCopy } from "../accounts";

/** Token form/row copy for gitlab.com, or for one GitLab Self-Managed server. */
export function useGitLabTokenCopy(server?: { host: string }): TokenConnectionCopy {
  const { t } = useLanguage();
  return {
    connect: t.gitlabTokenConnect,
    connected: t.gitlabTokenConnected,
    exists: t.gitlabTokenExists,
    label: t.gitlabTokenLabel,
    limit: t.gitlabTokenLimit,
    limitReached: t.gitlabTokenLimitReached,
    permissions: t.gitlabTokenPermissions,
    permissionsTitle: t.gitlabTokenPermissionsTitle,
    removalConsent: t.gitlabTokenRemovalConsent,
    removalTitle: t.gitlabTokenRemovalTitle,
    remove: t.gitlabTokenRemove,
    removed: t.gitlabTokenRemoved,
    storage: t.gitlabTokenStorage,
    title: server ? t.gitlabTokenServerTitle.replace("{host}", server.host) : t.gitlabTokenTitle,
    failed: t.gitlabAuthStatus.failed, checking: t.gitlabAuthStatus.checking, chips: t.gitlabAuthChip,
  };
}
