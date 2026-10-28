import { avatarInitials } from "../../shared/ui";

/** The initials of the name the person set, e.g. "Luis Muñoz Martínez" → "LM".
 * The same rule as their saved versions' avatar, so "you" reads the same in
 * the titlebar and in History. */
export function profileInitials(name: string): string {
  return avatarInitials(name);
}

/** The GitOdile profile's face: the initials of the configured name. It never
 * shows a hosting account's picture, and it is not the project's icon; until
 * GitOdile sign-in decides otherwise it has no picture at all (ADR 0038). */
export function ProfileAvatar({ name, large = false }: { name: string; large?: boolean }): React.JSX.Element {
  return <span className={`account-avatar${large ? " account-avatar--large" : ""}`} aria-hidden="true">
    {profileInitials(name)}
  </span>;
}
