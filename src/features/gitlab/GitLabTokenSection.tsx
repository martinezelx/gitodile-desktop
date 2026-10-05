import { useLanguage } from "../../i18n";
import { TokenConnectionSection, type AccountsPort } from "../accounts";
import { gitlabTokenPort } from "./tauriAdapter";
import type { GitLabTokenPort } from "./tokenPort";
export function GitLabTokenSection({ port = gitlabTokenPort, accountPort }: { port?: GitLabTokenPort; accountPort?: AccountsPort }): React.JSX.Element {
    const { t } = useLanguage();
    return <TokenConnectionSection provider="gitlab" port={port} accountPort={accountPort} copy={{
      add: t.gitlabTokenAdd,
      alternative: t.gitlabTokenAlternative,
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
      selectedPurpose: t.gitlabTokenSelectedPurpose,
      storage: t.gitlabTokenStorage,
      storageShort: t.gitlabTokenStorageShort,
      title: t.gitlabTokenTitle,
      failed: t.gitlabAuthStatus.failed, checking: t.gitlabAuthStatus.checking, chips: t.gitlabAuthChip,
    }} />;
}
