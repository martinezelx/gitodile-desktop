import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  clearInstallDraft,
  readInstallDraft,
  setInstallDraftBlocker,
  writeInstallDraft,
} from "./store";

export function usePersistedInstallDraft<T>(
  ownerId: string,
  label: string,
  initialValue: T,
  isEmpty: (value: T) => boolean,
  validate: (value: unknown) => value is T,
): readonly [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const restore = (): T => readInstallDraft(ownerId, validate) ?? initialValue;
  const [slot, setSlot] = useState<{ ownerId: string; value: T }>(() => ({
    ownerId,
    value: restore(),
  }));
  let value = slot.value;
  if (slot.ownerId !== ownerId) {
    value = restore();
    setSlot({ ownerId, value });
  }
  const valueRef = useRef(value);
  valueRef.current = value;

  const setValue = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (next) => {
      const value = typeof next === "function" ? (next as (current: T) => T)(valueRef.current) : next;
      valueRef.current = value;
      if (isEmpty(value)) clearInstallDraft(ownerId);
      else writeInstallDraft(ownerId, label, value);
      setSlot({ ownerId, value });
    },
    [isEmpty, label, ownerId],
  );
  const clear = useCallback(() => {
    clearInstallDraft(ownerId);
    valueRef.current = initialValue;
    setSlot({ ownerId, value: initialValue });
  }, [initialValue, ownerId]);
  return [value, setValue, clear] as const;
}

export function useInstallDraftBlocker(ownerId: string, label: string, blocked: boolean): void {
  useLayoutEffect(() => {
    setInstallDraftBlocker(ownerId, label, blocked);
    return () => setInstallDraftBlocker(ownerId, label, false);
  }, [blocked, label, ownerId]);
}

