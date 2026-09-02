/**
 * Lecture Google Sheets via clé API (Sheet partagé « Toute personne disposant du lien » en lecture).
 * Aucun compte de service requis.
 */
export async function buildGoogleSheetsReadAuth(): Promise<{
  authorizationHeader: null;
  apiKey: string;
}> {
  const apiKey =
    process.env.GOOGLE_SHEETS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Variable GOOGLE_SHEETS_API_KEY ou NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY manquante."
    );
  }

  return {
    authorizationHeader: null,
    apiKey,
  };
}
