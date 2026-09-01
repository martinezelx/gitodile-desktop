const AVATAR_PALETTE_SIZE = 8;

/**
 * A stable (never re-randomized on render or relaunch) index into the
 * avatar color palette, derived from the project's canonical id. Two
 * projects that happen to share a first letter still need a different
 * color to tell them apart at a glance in the collapsed sidebar — a truly
 * random color would solve that but would also reassign on every reopen,
 * defeating the point of recognizing a project by its avatar.
 */
export function avatarPaletteIndex(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % AVATAR_PALETTE_SIZE;
}

/** CSS `var()` reference for the palette color at `id`'s index (see
 * `--avatar-color-0`.. in styles.css). */
export function avatarColorVar(id: string): string {
  return `var(--avatar-color-${avatarPaletteIndex(id)})`;
}

/**
 * Two letters when the name has multiple words/segments ("my-app" → "MA",
 * "gitodile app" → "GA"), otherwise the first two characters of a single
 * word ("gitodile" → "GI") — a single shared initial is exactly the
 * ambiguity color-coding alone can't fully resolve, so this gives a second,
 * independent signal.
 */
export function avatarInitials(name: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase() || "?";
}
