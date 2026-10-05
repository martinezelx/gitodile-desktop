import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronLeft, ChevronRight, LockKeyhole, Search, X } from "lucide-react";
import { useLanguage } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { AccountPicker, type AccountCatalog } from "../accounts";
import { autoHideScrollbarProps, HostingProviderIcon, RefreshIconButton } from "../../shared/ui";
import type { RepositoryBrowserController } from "./controller";
import type { RepositoryChoice } from "./domain";

export function RepositoryBrowser({ controller, catalog, checking, failed, onCheck, onChoose, selected, onClearSelection, provider = "github" }: {
  controller: RepositoryBrowserController; catalog: AccountCatalog; checking: boolean; failed: boolean;
  onCheck: () => void; onChoose: (choice: RepositoryChoice) => void;
  selected?: RepositoryChoice | null; onClearSelection?: () => void; provider?: string;
}): React.JSX.Element {
  const { t } = useLanguage();
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeRow, setActiveRow] = useState(0);
  const focusRow = useRef<number | null>(null);
  const account = catalog.accounts.find(account => account.id === state.accountId && account.available);
  const rows = (state.page?.repositories ?? []).filter(row => `${row.fullName} ${row.description ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current,
    estimateSize: () => 58, overscan: 4, getItemKey: index => rows[index].id });
  const virtualRows = virtualizer.getVirtualItems();
  // The roving tab stop must remain rendered after wheel scrolling or a page
  // refresh that removes the previously active row.
  const tabRow = virtualRows.some(item => item.index === activeRow) ? activeRow : virtualRows[0]?.index;
  useLayoutEffect(() => { focusRow.current = null; setActiveRow(0); }, [query, state.accountId, state.page]);
  useLayoutEffect(() => {
    if (focusRow.current === null) return;
    const button = scrollRef.current?.querySelector<HTMLButtonElement>(`button[data-row="${focusRow.current}"]`);
    if (button) { button.focus({ preventScroll: true }); focusRow.current = null; }
  }, [activeRow, virtualRows]);
  useEffect(() => { if (!catalog.busy) controller.reconcile(catalog.accounts); }, [controller, catalog]);
  useEffect(() => { setQuery(""); scrollRef.current?.scrollTo?.({ top: 0 }); }, [state.accountId, state.page?.page]);
  useEffect(() => () => controller.cancel(), [controller]);
  return <div className="repository-browser">
    <div className="repository-browser__connection"><HostingProviderIcon provider={provider} />
      <AccountPicker catalog={catalog} provider={provider} value={state.accountId} onChange={id => { onClearSelection?.(); controller.select(id); }}
        label={t.cloneConnectionLabel} showHelp={false} onCheck={onCheck} disabled={checking} failed={failed} required />
    </div>
    <div className="repository-browser__search">
      <label className="text-field"><span className="visually-hidden">{t.repositoriesFilter}</span><Search aria-hidden="true" />
        <input type="search" placeholder={t.repositoriesFilter} value={query} disabled={!state.page} onChange={event => setQuery(event.target.value)} />
      </label>
      <RefreshIconButton label={state.page ? t.repositoriesRefresh : t.repositoriesLoad} busyLabel={t.repositoriesLoading} busy={state.pending}
        disabled={!account || catalog.busy || checking} onClick={() => { onClearSelection?.(); void controller.load(state.page?.page ?? 1); }} />
      {state.pending && <button type="button" className="secondary-button refresh-icon-button" aria-label={t.commonCancel} data-tooltip={t.commonCancel} onClick={controller.cancel}><X aria-hidden="true" /></button>}
    </div>
    <div className="repository-browser__list auto-hide-scrollbar" ref={scrollRef} {...autoHideScrollbarProps<HTMLDivElement>()}
      aria-busy={state.pending}
        onKeyDown={event => {
          if (!rows.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, activeRow + (event.key === "ArrowDown" ? 1 : -1)));
          focusRow.current = next; setActiveRow(next); virtualizer.scrollToIndex(next, { align: "auto" });
        }}>
        {state.error != null && <p className="repository-browser__message" role="alert">{isAppError(state.error) && state.error.code === "permission_denied" ? t.repositoriesDenied : localizeAppError(state.error, t, t.repositoriesError)}</p>}
        {!state.page && !state.pending && state.error == null && <p className="repository-browser__message">{account ? t.repositoriesLoadHint : t.repositoriesConnectionHint}</p>}
        {state.page && rows.length === 0 && <p className="repository-browser__message">{state.page.repositories.length === 0 ? t.repositoriesEmpty : t.repositoriesNoMatches}</p>}
        <div role="list" aria-label={t.repositoriesBrowse} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualRows.map(item => {
            const row = rows[item.index];
            return <div role="listitem" key={row.id} className="repository-browser__row" data-index={item.index}
              ref={virtualizer.measureElement} style={{ position: "absolute", width: "100%", top: 0, transform: `translateY(${item.start}px)` }}>
              <button type="button" className="repository-browser__project" disabled={!account || state.pending || catalog.busy}
                aria-pressed={selected?.repository.id === row.id && selected.accountId === state.accountId}
                data-row={item.index} tabIndex={item.index === tabRow ? 0 : -1} onFocus={() => setActiveRow(item.index)}
                aria-label={t.repositoriesChoose.replace("{project}", row.fullName)} onClick={() => onChoose({ repository: row, accountId: state.accountId! })}>
                <HostingProviderIcon provider={provider} />
                <span className="repository-browser__project-text">
                  <span className="repository-browser__project-heading"><strong><span className="repository-browser__owner">{row.owner}/</span>{row.name}</strong>
                    <span className="repository-browser__badge">{row.private && <LockKeyhole aria-hidden="true" />}{row.private ? t.repositoriesPrivate : t.repositoriesPublic}</span>
                    {row.archived && <span className="repository-browser__badge">{t.repositoriesArchived}</span>}
                  </span>
                  {row.description && <small title={row.description}>{row.description}</small>}
                </span>
                {selected?.repository.id === row.id && selected.accountId === state.accountId && <Check className="repository-browser__selected" aria-hidden="true" />}
              </button>
            </div>;
          })}
        </div>
    </div>
    <div className="repository-browser__pagination">
      <p role="status">{state.pending ? t.repositoriesLoading : state.page ? t.repositoriesPage.replace("{page}", String(state.page.page)).replace("{count}", String(state.page.repositories.length)) : ""}</p>
      {state.page && (state.page.page > 1 || state.page.nextPage !== null) && <div>
        <button type="button" className="secondary-button refresh-icon-button" aria-label={t.repositoriesPrevious} data-tooltip={t.repositoriesPrevious} disabled={!account || state.pending || state.page.page <= 1} onClick={() => { onClearSelection?.(); void controller.load(state.page!.page - 1); }}><ChevronLeft aria-hidden="true" /></button>
        <button type="button" className="secondary-button refresh-icon-button" aria-label={t.repositoriesNext} data-tooltip={t.repositoriesNext} disabled={!account || state.pending || state.page.nextPage === null} onClick={() => { onClearSelection?.(); void controller.load(state.page!.nextPage!); }}><ChevronRight aria-hidden="true" /></button>
      </div>}
    </div>
  </div>;
}
