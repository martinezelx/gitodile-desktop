/** One native watcher registration: a project path and the session incarnation
 * it belongs to. Rust rejects a callback whose epoch no longer matches, so the
 * epoch travels with the path everywhere. */
export type WatcherRegistration = { path: string; epoch: string };

export type WatcherPlan = { unwatch: WatcherRegistration[]; watch: WatcherRegistration[] };

/**
 * Which registrations to add and remove to bring the native watchers in line
 * with the open sessions.
 *
 * Pure so the rule that matters can be asserted rather than assumed: with
 * watching turned off the desired set is empty, so everything currently held
 * is unwatched and nothing is registered — `watch_repository` is the only way
 * a filesystem watcher comes into existence, and this is the only caller.
 *
 * A session whose epoch changed appears in both lists: the old incarnation is
 * torn down and the new one registered, which is what reopening the same path
 * has always done.
 */
export function planWatcherChanges(
  registered: Record<string, string>,
  sessions: Array<{ path: string; epoch: string | undefined }>,
  isWatching: boolean,
): WatcherPlan {
  const desired = new Map<string, string | undefined>(
    isWatching ? sessions.map((session) => [session.path, session.epoch]) : [],
  );
  return {
    unwatch: Object.entries(registered)
      .filter(([path, epoch]) => desired.get(path) !== epoch)
      .map(([path, epoch]) => ({ path, epoch })),
    watch: [...desired.entries()].flatMap(([path, epoch]) =>
      epoch && registered[path] !== epoch ? [{ path, epoch }] : [],
    ),
  };
}
