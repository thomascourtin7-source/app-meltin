export const SPREADSHEET_ID_KEY = "meltin_spreadsheet_id";

export function readSpreadsheetId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(SPREADSHEET_ID_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function writeSpreadsheetId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SPREADSHEET_ID_KEY, id.trim());
}
