import webpush from "web-push";

/**
 * Applique `webpush.setVapidDetails(subject, publicKey, privateKey)`.
 * `VAPID_SUBJECT` est **obligatoire** pour Apple Web Push : sans `mailto:` ou `https:`,
 * le JWT VAPID est invalide côté Apple → erreur **BadJwtToken**.
 */
export function applyVapidDetailsIfPossible(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey) {
    return false;
  }

  if (!subject) {
    console.error(
      "[VAPID] VAPID_SUBJECT est absent ou vide. " +
        "Apple Web Push rejette le JWT (erreur BadJwtToken) sans sujet d’identité valide. " +
        "Sur Vercel, ajoutez par exemple : VAPID_SUBJECT=mailto:contact@votredomaine.com"
    );
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}
