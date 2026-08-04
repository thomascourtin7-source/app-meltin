/** Domaine public des liens de suivi D.O. (toujours meltincdg.fr en prod). */
export const MELTIN_TRACKING_ORIGIN = "https://meltincdg.fr";

export function buildTrackUrl(shareToken: string): string {
  const token = shareToken.trim();
  return `${MELTIN_TRACKING_ORIGIN}/track/${encodeURIComponent(token)}`;
}

export function buildWhatsAppShareUrl(trackUrl: string, passengerLabel: string): string {
  const text = encodeURIComponent(
    `Suivi de mission Meltin — ${passengerLabel}\n${trackUrl}`
  );
  return `https://wa.me/?text=${text}`;
}
