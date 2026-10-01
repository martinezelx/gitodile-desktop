import React from "react";
import { avatarColorVar, avatarInitials } from "./projectAvatar";
import { rawSvgImage } from "./rawSvgImage";
import {
  resolveProjectIdentity,
  type ProjectAvatarStyle,
  type ProjectIconChoice,
  type TechnologyId,
} from "./projectIdentity";
import { TECHNOLOGY_MARKS } from "./technologyMarks";

export type ProjectAvatarProps = {
  /** The canonical worktree root: the identity the palette colour hashes. */
  id: string;
  /** The project's display name, for the initials fallback. */
  name: string;
  /** The per-surface avatar class (`.sidebar-project__avatar`, …), which owns
   * the box size, radius and the brand ring. */
  className: string;
  /** The project's own choice — an emoji, or `PROJECT_ICON_INITIALS` to force
   * the two letters — which outranks the global style. `null`/absent follows
   * the global style. */
  iconChoice?: ProjectIconChoice;
  /** The detected technology, shown under the emoji when the global style is
   * "technology". */
  technology?: TechnologyId | null;
  /** The global appearance preference. Defaults to "technology". */
  style?: ProjectAvatarStyle;
};

/** A project's identity chip, rendered consistently everywhere it appears.
 *
 * One component rather than four copies of the same span: the precedence
 * (chosen emoji > global appearance style) and the technology artwork should
 * not be re-derived or drift between the rail, the switcher, the compact
 * trigger and the welcome recents. The whole chip is decorative — the row
 * always names the project in text beside it — so it stays `aria-hidden`. */
export function ProjectAvatar({
  id,
  name,
  className,
  iconChoice,
  technology,
  style,
}: ProjectAvatarProps): React.JSX.Element {
  const identity = resolveProjectIdentity({ id, choice: iconChoice, technology, style });

  if (identity.kind === "emoji") {
    return (
      <span
        className={`${className} project-avatar--emoji`}
        aria-hidden="true"
        style={{
          backgroundColor: `color-mix(in srgb, ${avatarColorVar(id)} 22%, var(--surface-panel))`,
        }}
      >
        <span className="project-avatar__glyph">{identity.emoji}</span>
      </span>
    );
  }

  if (identity.kind === "technology") {
    const Mark = rawSvgImage(TECHNOLOGY_MARKS[identity.technology]);
    return (
      <span className={className} aria-hidden="true">
        <span className="project-avatar__tray">
          <Mark className="project-avatar__mark" />
        </span>
      </span>
    );
  }

  return (
    <span className={className} aria-hidden="true" style={{ backgroundColor: avatarColorVar(id) }}>
      {avatarInitials(name)}
    </span>
  );
}
