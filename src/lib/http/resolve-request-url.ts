/**
 * Résout l’URL de la requête sans `url.parse()` (évite DEP0169 sur Node 25+ / Vercel).
 * Si `req.url` est déjà absolue, la base est ignorée (comportement WHATWG URL).
 */
export function resolveRequestUrl(req: Request): URL {
  const host = req.headers.get("host") ?? "localhost";
  return new URL(req.url, `https://${host}`);
}
