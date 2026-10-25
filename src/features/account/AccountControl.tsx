import React, { useId, useRef, useSyncExternalStore } from "react";
import { UserRound } from "lucide-react";
import { useLanguage } from "../../i18n";
import type { AccountController } from "./controller";

export function AccountControl({ controller, compact = false, menuClassName = "app-menu__item", onOpen, fallbackRef }: {
  controller: AccountController;
  compact?: boolean;
  menuClassName?: "app-menu__item" | "titlebar-menu__item";
  onOpen?: () => void;
  fallbackRef?: React.RefObject<HTMLElement | null>;
}): React.JSX.Element {
  const { t } = useLanguage();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const identity = state.account.kind === "signed-in" ? state.account.identity : null;
  const statusId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isExpanded = state.popoverOpen && state.anchor === (fallbackRef?.current ?? buttonRef.current);
  const label = `${identity?.name ?? t.accountSignIn} · ${t.accountDemo}`;
  return <button
    ref={buttonRef}
    className={compact ? menuClassName : "sidebar-round sidebar-round--account"}
    type="button" role={compact ? "menuitem" : undefined}
    tabIndex={compact ? -1 : undefined}
    aria-label={label} data-tooltip={compact ? undefined : label}
    aria-describedby={identity ? statusId : undefined}
    aria-haspopup="dialog" aria-expanded={isExpanded}
    onClick={(event) => {
      const anchor = fallbackRef?.current ?? event.currentTarget;
      onOpen?.();
      if (isExpanded) controller.closePopover(true);
      else controller.open(anchor);
    }}
  >
    <span className="account-control__glyph" aria-hidden="true">
      {identity ? <><span className="account-avatar">{identity.initials}</span><span className="account-control__status" /></> : <UserRound />}
    </span>
    {identity && <span id={statusId} className="visually-hidden">{t.accountSuccess}</span>}
    {compact && <span>{label}</span>}
  </button>;
}
