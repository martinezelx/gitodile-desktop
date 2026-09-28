import type { SavedVersionAuthor } from "./domain";

/** Whether a version was saved under the user's own Git identity, so a
 * surface can say "You" instead of their name. Matched on the email, which is
 * what identifies an author across machines; case and surrounding space are
 * not significant in one. */
export function isSelfAuthor(author: SavedVersionAuthor | null, selfEmail: string | null | undefined): boolean {
  const self = selfEmail?.trim().toLocaleLowerCase();
  if (!self || !author) return false;
  return author.email.trim().toLocaleLowerCase() === self;
}
