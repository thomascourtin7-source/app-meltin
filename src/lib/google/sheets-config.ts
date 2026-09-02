/** Plage par défaut : onglet Feuille 1, colonnes A–M. */
export function getPlanningSheetRange(): string {
  const fromEnv =
    process.env.PLANNING_SHEET_RANGE?.trim() ||
    process.env.NEXT_PUBLIC_PLANNING_SHEET_RANGE?.trim();
  if (fromEnv) return fromEnv;
  return "'Feuille 1'!A1:M2500";
}

/** Extrait le nom d'onglet depuis une plage A1 (`'Feuille 1'!A1:M2500`). */
export function parseSheetTabName(range: string): string {
  const trimmed = range.trim();
  const bang = trimmed.indexOf("!");
  const tabPart = bang >= 0 ? trimmed.slice(0, bang) : trimmed;
  return tabPart.replace(/^'|'$/g, "").trim() || "Feuille 1";
}

/**
 * Identifiant Google Sheet pour écriture.
 * `GOOGLE_SHEET_ID` (demandé) puis repli sur les variables planning existantes.
 */
export function readGoogleSpreadsheetId(): string | null {
  const id =
    process.env.GOOGLE_SHEET_ID?.trim() ||
    process.env.PLANNING_SPREADSHEET_ID?.trim() ||
    process.env.NEXT_PUBLIC_PLANNING_SPREADSHEET_ID?.trim() ||
    "";
  return id || null;
}

/** Colonne 0-based → lettre A1 (0 = A, 10 = K). */
export function columnIndexToA1Letter(columnIndex: number): string {
  if (columnIndex < 0) return "A";
  let temp = columnIndex + 1;
  let letter = "";
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter || "A";
}

export function buildSheetCellRange(
  tabName: string,
  columnIndex: number,
  rowNumber1Based: number
): string {
  const col = columnIndexToA1Letter(columnIndex);
  const safeTab = tabName.replace(/'/g, "''");
  return `'${safeTab}'!${col}${rowNumber1Based}`;
}
