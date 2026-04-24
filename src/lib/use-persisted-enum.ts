"use client";

import { useCallback, useSyncExternalStore } from "react";

export function usePersistedEnum<T extends string>(
  storageKey: string,
  eventName: string,
  defaultValue: T,
  isValid: (value: string) => value is T
): [T, (next: T) => void] {
  const subscribe = useCallback(
    (callback: () => void) => {
      // localStorage's 'storage' event only fires in *other* tabs, so we also
      // dispatch a custom event on same-tab writes.
      window.addEventListener("storage", callback);
      window.addEventListener(eventName, callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener(eventName, callback);
      };
    },
    [eventName]
  );

  const getSnapshot = useCallback((): T => {
    const raw = window.localStorage.getItem(storageKey);
    return raw !== null && isValid(raw) ? raw : defaultValue;
  }, [storageKey, defaultValue, isValid]);

  const getServerSnapshot = useCallback((): T => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T) => {
      window.localStorage.setItem(storageKey, next);
      window.dispatchEvent(new Event(eventName));
    },
    [storageKey, eventName]
  );

  return [value, setValue];
}
