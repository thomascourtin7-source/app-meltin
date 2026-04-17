"use client";

import { useSyncExternalStore } from "react";

import {
  SPREADSHEET_ID_KEY,
  readSpreadsheetId,
} from "@/lib/client-storage";

const SHEET_EVENT = "meltin-sheet-id";

function subscribe(onStoreChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SPREADSHEET_ID_KEY || e.key === null) onStoreChange();
  };
  const onCustom = () => {
    onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SHEET_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SHEET_EVENT, onCustom);
  };
}

/** ID du spreadsheet (localStorage), cohérent SSR / client. */
export function useLocalSpreadsheetId(): string | null {
  return useSyncExternalStore(subscribe, readSpreadsheetId, () => null);
}

export function notifySpreadsheetIdChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SHEET_EVENT));
}
