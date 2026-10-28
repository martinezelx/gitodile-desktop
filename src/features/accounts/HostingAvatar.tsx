import { useState } from "react";
import { UserRound } from "lucide-react";
import { HostingProviderIcon } from "../../shared/ui";
import { isPictureDataUrl } from "./domain";

/** A hosting account's face: the picture its provider holds, or the person
 * glyph when there is none or it fails to decode. It is round, a person, and
 * neither the project's rounded-square icon nor the GitOdile profile, which
 * never borrows it. In an account list the provider's mark sits at its corner;
 * the mark is decorative because every list sits under its provider's name.
 * `badge={false}` drops it where the slot is too small to carry it. */
export function HostingAvatar({ picture, provider, badge = true }: {
  picture: string | null | undefined;
  /** The provider product (`github`, `gitlab`, `bitbucket`, `azure`). */
  provider: string;
  badge?: boolean;
}): React.JSX.Element {
  const [failed, setFailed] = useState<string | null>(null);
  const shown = isPictureDataUrl(picture) && picture !== failed ? picture : null;
  return <span className="hosting-avatar" aria-hidden="true">
    <span className="hosting-avatar__face">
      {shown ? <img src={shown} alt="" onError={() => setFailed(shown)} /> : <UserRound />}
    </span>
    {badge && <span className="hosting-avatar__badge"><HostingProviderIcon provider={provider} /></span>}
  </span>;
}
