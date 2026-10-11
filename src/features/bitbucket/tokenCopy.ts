import { useLanguage } from "../../i18n";
import type { TokenConnectionCopy } from "../accounts";

/** Token form/row copy for bitbucket.org, which connects with an API token
 * only: there is no browser connection or company server. */
export function useBitbucketTokenCopy(): TokenConnectionCopy {
  const { t } = useLanguage();
  return {
    connect: t.bitbucketTokenConnect,
    connected: t.bitbucketTokenConnected,
    exists: t.bitbucketTokenExists,
    label: t.bitbucketTokenLabel,
    limit: t.bitbucketTokenLimit,
    limitReached: t.bitbucketTokenLimitReached,
    permissions: t.bitbucketTokenPermissions,
    permissionsTitle: t.bitbucketTokenPermissionsTitle,
    removalConsent: t.bitbucketTokenRemovalConsent,
    removalTitle: t.bitbucketTokenRemovalTitle,
    remove: t.bitbucketTokenRemove,
    removed: t.bitbucketTokenRemoved,
    storage: t.bitbucketTokenStorage,
    title: t.bitbucketTokenTitle,
    failed: t.bitbucketTokenFailed, checking: t.bitbucketTokenChecking, chips: t.bitbucketTokenChip,
    permissionDenied: t.bitbucketTokenPermissionDenied,
  };
}
