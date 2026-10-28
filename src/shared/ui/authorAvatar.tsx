import { avatarColorVar, avatarInitials } from "./projectAvatar";

/** Who saved a version: their initials on a colour that is theirs wherever
 * they appear — keyed on the email when there is one, so two people who share
 * initials still read apart. The name is on the tooltip.
 *
 * The user's own versions wear their initials too, on a neutral tint rather
 * than a colour of their own: "you" is the one author the reader never needs
 * to tell apart by colour. A hosting account's picture never appears here; it
 * belongs where the account itself is the subject (ADR 0038).
 *
 * `row` is a timeline row's size; `strip` the one a detail strip wears beside
 * its title, where the avatar is the only trace of the author left. */
export function AuthorAvatar({ name, email, isSelf, tooltip, size = "row" }: {
  /** `null` when the version records no author at all. */
  name: string | null;
  email?: string | null;
  isSelf: boolean;
  tooltip: string;
  size?: "row" | "strip";
}): React.JSX.Element {
  const sizeClass = size === "strip" ? " author-avatar--strip" : "";
  if (isSelf) {
    return (
      <span className={`author-avatar author-avatar--self${sizeClass}`} data-tooltip={tooltip} aria-hidden="true">
        {name ? avatarInitials(name) : "?"}
      </span>
    );
  }
  const identity = email?.trim().toLocaleLowerCase() || name?.trim() || "?";
  return (
    <span
      className={`author-avatar${sizeClass}`}
      style={{ "--author-color": avatarColorVar(identity) } as React.CSSProperties}
      data-tooltip={tooltip}
      aria-hidden="true"
    >
      {name ? avatarInitials(name) : "?"}
    </span>
  );
}
