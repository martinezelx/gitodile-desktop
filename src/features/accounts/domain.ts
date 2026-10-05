import type { AppError } from "../../shared/i18n";
/** Shared account/access contract. Secrets never cross this boundary. */
export type HostingAccount = {
  id: string; provider: string; host: string; login: string;
  avatarDataUrl: string | null; available: boolean;
  unavailableReason?: AppError["code"] | null;
};
export type AccountCatalog = {
  providers: { id: string; host: string }[];
  accounts: HostingAccount[]; busy: boolean;
};
export type AccountProject = { path: string; sessionEpoch: string };
export type ProjectAccount = { accountId: string | null };
export const EMPTY_ACCOUNT_CATALOG: AccountCatalog = { providers: [], accounts: [], busy: false };
export function providerForSource(source: string, providers: AccountCatalog["providers"]): string | null {
  try {
    const url = new URL(source.trim());
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search) return null;
    return providers.find(provider => provider.host === url.hostname)?.id ?? null;
  } catch { return null; }
}
