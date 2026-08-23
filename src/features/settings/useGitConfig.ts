import { useCallback, useEffect, useState } from "react";

import type { GitIdentity, GitLineEndings, LineEndingChoice } from "./domain";
import type { SettingsPort } from "./port";

/** The two Settings reads that hit the user's global Git config.
 *
 * They live here, above the dialog, for the same reason `useGitTooling` does:
 * the shell unmounts `SettingsPanel` on every close, so a read owned by the
 * panel starts from nothing every time it is opened. Each of these costs a
 * `git config` process — roughly 55 ms on Windows — and the panel used to wait
 * for them while the user watched.
 *
 * Read once after first paint and kept afterwards, so the panel renders real
 * values on its first frame from the second opening onwards, and the first
 * read happens while the user is doing something else. */

export type GitIdentityValue = { name: string; email: string };

export type GitIdentityState = {
  identity: GitIdentityValue;
  /** False until the first read answers. The panel seeds its draft from
   * `identity`, so it has to know the difference between "no name set" and
   * "not read yet" or it would seed an empty draft over a real name. */
  isLoaded: boolean;
  isSaving: boolean;
  /** Rejects with whatever the port rejected with, so the caller can localize
   * it; the saved value is only advanced once Git has accepted it. */
  save: (identity: GitIdentityValue) => Promise<void>;
};

const EMPTY_IDENTITY: GitIdentityValue = { name: "", email: "" };

function toValue(identity: GitIdentity): GitIdentityValue {
  return { name: identity.name ?? "", email: identity.email ?? "" };
}

export function useGitIdentity(port: SettingsPort): GitIdentityState {
  const [identity, setIdentity] = useState<GitIdentityValue>(EMPTY_IDENTITY);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    port
      .getIdentity()
      .then((result) => {
        if (isCurrent) {
          setIdentity(toValue(result));
          setIsLoaded(true);
        }
      })
      /* A failed read leaves the empty identity and marks it answered: the
         panel then shows blank fields the user can fill in, which is the same
         thing an unset identity looks like and the only useful next step. */
      .catch(() => {
        if (isCurrent) {
          setIsLoaded(true);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [port]);

  const save = useCallback(
    async (next: GitIdentityValue): Promise<void> => {
      setIsSaving(true);
      try {
        await port.setIdentity(next);
        setIdentity(next);
      } finally {
        setIsSaving(false);
      }
    },
    [port],
  );

  return { identity, isLoaded, isSaving, save };
}

export type LineEndingsState = {
  /** Null while the first read is outstanding, which the panel renders as
   * "checking" rather than as an answer. */
  lineEndings: GitLineEndings | null;
  isSaving: boolean;
  choose: (choice: LineEndingChoice) => Promise<void>;
};

/** Takes the open project's path and epoch as separate values rather than the
 * project object: the caller rebuilds that object on every render, and an
 * object identity in the dependencies would re-run the read for nothing. */
export function useLineEndings(
  port: SettingsPort,
  projectPath: string | null,
  projectEpoch: string | null,
): LineEndingsState {
  const [lineEndings, setLineEndings] = useState<GitLineEndings | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const read = useCallback((): Promise<GitLineEndings> => {
    return port.readLineEndings(
      projectPath !== null && projectEpoch !== null && projectEpoch !== ""
        ? { path: projectPath, sessionEpoch: projectEpoch }
        : null,
    );
  }, [port, projectEpoch, projectPath]);

  useEffect(() => {
    let isCurrent = true;
    read()
      .then((result) => {
        if (isCurrent) {
          setLineEndings(result);
        }
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, [read]);

  const choose = useCallback(
    async (choice: LineEndingChoice): Promise<void> => {
      setIsSaving(true);
      try {
        await port.setLineEndings(choice);
        // Read back rather than assume: a project that overrides the global
        // config still overrides it after the write, and saying otherwise
        // would report a setting that isn't the one applying here.
        setLineEndings(await read());
      } finally {
        setIsSaving(false);
      }
    },
    [port, read],
  );

  return { lineEndings, isSaving, choose };
}
