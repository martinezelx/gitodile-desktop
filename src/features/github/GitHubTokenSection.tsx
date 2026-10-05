import { useLanguage } from "../../i18n";
import { TokenConnectionSection, type AccountsPort } from "../accounts";
import { githubTokenPort } from "./tauriAdapter";
import type { GitHubTokenPort } from "./tokenPort";
export function GitHubTokenSection({ port = githubTokenPort, accountPort }: { port?: GitHubTokenPort; accountPort?: AccountsPort }): React.JSX.Element {
    const { t } = useLanguage();
    return <TokenConnectionSection provider="github" port={port} accountPort={accountPort} copy={{
      add: t.githubTokenAdd,
      alternative: t.githubTokenAlternative,
      connect: t.githubTokenConnect,
      connected: t.githubTokenConnected,
      exists: t.githubTokenExists,
      label: t.githubTokenLabel,
      limit: t.githubTokenLimit,
      limitReached: t.githubTokenLimitReached,
      permissions: t.githubTokenPermissions,
      permissionsTitle: t.githubTokenPermissionsTitle,
      removalConsent: t.githubTokenRemovalConsent,
      removalTitle: t.githubTokenRemovalTitle,
      remove: t.githubTokenRemove,
      removed: t.githubTokenRemoved,
      selectedPurpose: t.githubTokenSelectedPurpose,
      storage: t.githubTokenStorage,
      storageShort: t.githubTokenStorageShort,
      title: t.githubTokenTitle,
      failed: t.githubAuthStatus.failed, checking: t.githubAuthStatus.checking, chips: t.githubAuthChip,
    }} />;
}
