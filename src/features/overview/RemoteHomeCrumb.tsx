import React from "react";
import { ArrowUpRight, Cloud, Laptop } from "lucide-react";

import { useLanguage } from "../../i18n";
import { HostingProviderIcon, TextPlaceholder } from "../../shared/ui";
import type { RemoteHome } from "./port";
import type { RemoteHomeState } from "./workDetail";

const SERVICE_NAMES: Record<Exclude<RemoteHome["provider"], "other">, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  azure: "Azure Repos",
};

/** Where the project lives, as a chip beside its name. Its glyph is the
 * service's mark (a cloud for any other server, the computer with no remote)
 * in the secondary ink; the path is the remote's own, in mono, and opens the
 * page when Rust could derive one. Until it is read, its shape holds the
 * place rather than claiming there is no remote. */
export function RemoteHomeCrumb({ home, onOpen }: { home: RemoteHomeState; onOpen: (remote: string) => void }): React.JSX.Element | null {
  const { t } = useLanguage();
  if (home.status === "unavailable") return null;
  if (home.status === "unknown") {
    return (
      <span role="status" aria-label={t.overviewHomeLoading}>
        <TextPlaceholder className="overview-home__placeholder" />
      </span>
    );
  }
  if (!home.home) {
    return (
      <span className="overview-home" data-tooltip={t.overviewHomeLocalHint}>
        <Laptop className="overview-home__glyph" aria-hidden="true" />
        <span className="overview-home__local">{t.overviewHomeLocal}</span>
      </span>
    );
  }
  const { remote, provider, label, hasWebPage } = home.home;
  const glyph = provider === "other"
    ? <Cloud className="overview-home__glyph" aria-hidden="true" />
    : <span className="overview-home__glyph" aria-hidden="true"><HostingProviderIcon provider={provider} /></span>;
  const service = provider === "other" ? t.overviewHomeWeb : SERVICE_NAMES[provider];
  if (!hasWebPage) {
    return (
      <span className="overview-home" data-tooltip={t.overviewHomeRemote(remote)}>
        {glyph}
        <span className="overview-home__path">{label}</span>
      </span>
    );
  }
  return (
    <button
      className="overview-home overview-home--link"
      type="button"
      aria-label={t.overviewHomeOpen(label, service)}
      data-tooltip={`${t.overviewHomeOpen(label, service)} · ${t.overviewHomeRemote(remote)}`}
      onClick={() => onOpen(remote)}
    >
      {glyph}
      <span className="overview-home__path">{label}</span>
      <ArrowUpRight className="overview-home__out" aria-hidden="true" />
    </button>
  );
}
