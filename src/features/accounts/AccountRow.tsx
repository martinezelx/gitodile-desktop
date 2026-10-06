import type { ReactNode } from "react";
import { Globe, KeyRound, UserRound } from "lucide-react";
import { useLanguage } from "../../i18n";
import type { ToolChip } from "../../shared/ui";

/** One connection in an account list. Every row has the same geometry: a
 * 32px avatar, the login with its method and state chips on one line, and the
 * actions on the right. A second line appears only for something to act on
 * (a failure or a storage warning), never to repeat the chip. */
export function AccountRow({ login, method, state, avatar, notice, actions }: {
  login: string;
  method: "token" | "browser";
  state: ToolChip;
  /** An image for the avatar circle; the person glyph otherwise. */
  avatar?: ReactNode;
  notice?: ReactNode;
  actions: ReactNode;
}): React.JSX.Element {
  const { t } = useLanguage();
  return <div className="account-row" role="group" aria-label={`@${login}`}>
    <span className="account-row__avatar" aria-hidden="true">{avatar ?? <UserRound />}</span>
    <div className="account-row__main">
      <div className="account-row__head">
        <strong className="account-row__name">@{login}</strong>
        <span className="tool-row__chip tool-row__chip--neutral account-row__method">
          {method === "token" ? <KeyRound aria-hidden="true" /> : <Globe aria-hidden="true" />}
          <span>{method === "token" ? t.accountsTokenMethod : t.accountsBrowserMethod}</span>
        </span>
        <span className={`tool-row__chip tool-row__chip--${state.tone}`}>{state.icon}<span>{state.label}</span></span>
      </div>
      {notice && <div className="account-row__notice">{notice}</div>}
    </div>
    <div className="account-row__actions">{actions}</div>
  </div>;
}
