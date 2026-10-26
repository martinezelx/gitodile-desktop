import React, { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, CreditCard, ExternalLink, LoaderCircle, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useLanguage } from "../../i18n";
import { Dialog, DialogBanner, useModalFocus, usePortalFlyout, useToast } from "../../shared/ui";
import type { AccountController } from "./controller";
import type { AccountScenario } from "./domain";

const SCENARIOS: readonly AccountScenario[] = ["success", "pro", "waiting", "offline", "unfinished", "expired", "cancelled"];

export function DemoControls({ controller, settings = false }: { controller: AccountController; settings?: boolean }): React.JSX.Element {
  const { t } = useLanguage();
  const { scenario } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const id = useId();
  return <div className={`account-demo${settings ? " account-demo--settings" : ""}`}>
    {!settings && <><span className="account-demo__label">{t.accountDemo}</span><p>{t.accountDemoHint}</p></>}
    <label htmlFor={id}>{t.accountScenario}</label>
    <select id={id} value={scenario} onChange={(event) => {
      const next = SCENARIOS.find((item) => item === event.target.value);
      if (next) controller.setScenario(next);
    }}>
      {SCENARIOS.map((item) => <option key={item} value={item}>{t.accountScenarios[item]}</option>)}
    </select>
    {settings && <p>{t.accountNextAttempt}</p>}
  </div>;
}

function AccountPopover({ controller }: { controller: AccountController }): React.JSX.Element | null {
  const { t } = useLanguage();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const anchorRef = useRef<HTMLElement | null>(state.anchor);
  anchorRef.current = state.anchor;
  const titleId = useId();
  const { popupRef, style } = usePortalFlyout(state.popoverOpen, anchorRef, controller.closePopover,
    state.anchor?.classList.contains("sidebar-round") ? "side" : "below", "first-control");
  if (!state.popoverOpen) return null;
  const identity = state.account.kind === "signed-in" ? state.account.identity : null;
  return createPortal(<div ref={popupRef} style={style} className="account-popover" role="dialog" aria-labelledby={titleId}
    onBlur={(event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !event.currentTarget.contains(next) && next !== anchorRef.current) {
        controller.closePopover(false);
      }
    }}>
    {identity ? <>
      <div className="account-person">
        <span className="account-avatar account-avatar--large" aria-hidden="true">{identity.initials}</span>
        <div><h2 id={titleId}>{identity.name} {identity.pro && <span className="account-pro">PRO</span>}</h2><p>{identity.email}</p></div>
      </div>
      <p className="account-demo__label">{t.accountDemo}</p>
      <div className="account-menu">
        <button type="button" disabled><CreditCard aria-hidden="true" />{t.accountPlan}<span>{t.accountUnavailable}</span></button>
        <button type="button" disabled><ShieldCheck aria-hidden="true" />{t.accountData}<span>{t.accountUnavailable}</span></button>
        <button type="button" onClick={controller.signOut}><LogOut aria-hidden="true" />{t.accountSignOut}</button>
      </div>
    </> : <>
      <h2 id={titleId}>{t.accountTitle}</h2>
      <p>{t.accountOptional}</p>
      <ul className="account-benefits">{t.accountBenefits.map((benefit) => <li key={benefit}><Check aria-hidden="true" />{benefit}</li>)}</ul>
      <DemoControls controller={controller} />
      <button className="primary-button account-sign-in" type="button" onClick={controller.start}><ExternalLink aria-hidden="true" />{t.accountSignIn}</button>
      <p className="account-browser-hint">{t.accountBrowserHint}</p>
    </>}
  </div>, document.body);
}

export function AccountOverlays({ controller, overSettings = false }: { controller: AccountController; overSettings?: boolean }): React.JSX.Element {
  const { t } = useLanguage();
  const { account } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const showToast = useToast();
  const lastSuccess = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isModal = account.kind === "waiting" || account.kind === "failed";
  const previousKind = useRef(account.kind);
  const dismiss = useCallback(() => controller.cancel(), [controller]);
  useModalFocus(isModal, dialogRef, dismiss);
  useEffect(() => {
    if (isModal) dialogRef.current?.focus();
  }, [account.kind, isModal]);
  useEffect(() => {
    const previous = previousKind.current;
    previousKind.current = account.kind;
    if (account.kind === "signed-out" && (previous === "waiting" || previous === "failed")) controller.restoreFocus();
  }, [account.kind, controller]);
  useEffect(() => {
    if (account.kind !== "signed-in" || lastSuccess.current === account.requestId) return;
    lastSuccess.current = account.requestId;
    showToast({ icon: <Check aria-hidden="true" />, message: `${t.accountSuccess}. ${t.accountSuccessDetail(account.identity.name, account.identity.pro)}` });
    controller.restoreFocus();
  }, [account, controller, showToast, t]);
  return <>
    <AccountPopover controller={controller} />
    {isModal && createPortal(<Dialog size="s" titleId={titleId} descriptionId={descriptionId}
      className={overSettings ? "account-dialog--over-settings" : undefined}
      title={account.kind === "waiting" ? t.accountWaiting : t.accountTitle}
      icon={<UserRound />} tone="app" onClose={dismiss} closeLabel={t.accountCancel} dialogRef={dialogRef}>
      {account.kind === "waiting" ? <>
        <p className="account-subtitle" id={descriptionId}>{t.accountCodeHint}</p>
        <div className="account-request-code">{account.request.code}</div>
        <ol className="account-steps">{t.accountSteps.map((step, index) => <li key={step} aria-current={index === 1 ? "step" : undefined}>
          <span className="account-step-number">{index === 0 ? <Check aria-hidden="true" /> : index + 1}</span>
          <span>{step}</span>{index === 1 && <LoaderCircle className="account-spinner" aria-hidden="true" />}
        </li>)}</ol>
        <div className="account-demo-note"><p className="account-demo__label">{t.accountDemo}</p><p className="account-browser-hint">{t.accountDemoHint}</p></div>
        <p className="account-reopen-feedback" role="status" aria-live="polite" key={account.reopened}>{account.reopened > 0 ? t.accountReopened : ""}</p>
        <div className="dialog-actions"><button className="secondary-button account-quiet" type="button" onClick={dismiss}>{t.accountCancel}</button>
          <button className="secondary-button" type="button" onClick={controller.reopen}>{t.accountReopen}</button></div>
      </> : account.kind === "failed" ? <>
        <div id={descriptionId}><DialogBanner tone="info" icon={<ShieldCheck />} role="status"><p>{t.accountFailures[account.reason]}</p><p>{t.accountLocalSafe}</p></DialogBanner></div>
        <DemoControls controller={controller} />
        <div className="dialog-actions"><button className="secondary-button account-quiet" type="button" onClick={dismiss}>{t.accountNotNow}</button>
          <button className="secondary-button" type="button" onClick={controller.start}>{t.accountRetry}</button></div>
      </> : null}
    </Dialog>, document.body)}
  </>;
}
