"use client";

import { useCallback, useSyncExternalStore } from "react";

function makeEventName(key: string) {
  return `meltin:localstorage:${key}`;
}

function safeRead(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? null : v;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    window.dispatchEvent(new Event(makeEventName(key)));
  } catch {
    // ignore
  }
}

export function useLocalStorageString(key: string, fallback = ""): {
  value: string;
  setValue: (next: string) => void;
  clear: () => void;
} {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) onStoreChange();
      };
      const onCustom = () => onStoreChange();
      window.addEventListener("storage", onStorage);
      window.addEventListener(makeEventName(key), onCustom);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(makeEventName(key), onCustom);
      };
    },
    [key]
  );

  const getSnapshot = useCallback(() => safeRead(key) ?? fallback, [key, fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: string) => {
      safeWrite(key, next);
    },
    [key]
  );

  const clear = useCallback(() => safeWrite(key, null), [key]);

  return { value, setValue, clear };
}

