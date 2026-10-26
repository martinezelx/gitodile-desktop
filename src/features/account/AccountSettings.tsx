import { useRef, useSyncExternalStore } from "react";
import { FlaskConical, Play, RotateCcw, UserRound } from "lucide-react";
import { useLanguage } from "../../i18n";
import { DemoControls } from "./AccountOverlays";
import type { AccountController } from "./controller";

/** The app injects this development-only body; Settings never owns a session. */
export function AccountSettings({ controller }: { controller: AccountController }): React.JSX.Element {
  const { t } = useLanguage();
  const { account } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const startRef = useRef<HTMLButtonElement>(null);
  const identity = account.kind === "signed-in" ? account.identity : null;
  return <div className="settings-groups account-settings">
    <section className="settings-group">
      <header className="settings-group__header">
        <h3>{t.accountSettingsSession}<span className="account-pro">Demo</span></h3>
        <p>{t.accountOptional}</p>
      </header>
      <div className="account-settings__identity">
        {identity ? <span className="account-avatar account-avatar--large" aria-hidden="true">{identity.initials}</span>
          : <span className="account-settings__placeholder" aria-hidden="true"><UserRound /></span>}
        <div className="account-settings__person">
          <strong>{identity?.name ?? t.accountSettingsSignedOut}</strong>
          <p>{identity?.email ?? t.accountSettingsSignedOutHint}</p>
          {identity && <span className="account-settings__plan">{identity.pro ? t.accountDemoPro : t.accountDemoFree}</span>}
        </div>
        {identity && <button type="button" className="secondary-button" onClick={() => {
          controller.signOut(); startRef.current?.focus();
        }}>{t.accountSignOut}</button>}
      </div>
    </section>
    <section className="settings-group">
      <header className="settings-group__header"><h3>{t.accountSettingsTry}</h3><p>{t.accountDemoHint}</p></header>
      <DemoControls controller={controller} settings />
      <div className="account-settings__actions">
        <button type="button" className="secondary-button" onClick={() => controller.reset()}><RotateCcw aria-hidden="true" />{t.accountReset}</button>
        <button ref={startRef} type="button" className="primary-button" onClick={event => controller.startFrom(event.currentTarget)}><Play aria-hidden="true" />{t.accountTrySignIn}</button>
      </div>
    </section>
    <p className="account-settings__notice"><FlaskConical aria-hidden="true" /><span>{t.accountSettingsPreview}</span></p>
  </div>;
}
