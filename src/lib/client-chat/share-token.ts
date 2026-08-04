/** Domaine public des liens de suivi D.O. (toujours meltincdg.fr en prod). */
export const MELTIN_TRACKING_ORIGIN = "https://meltincdg.fr";

export function buildTrackUrl(shareToken: string): string {
  const token = shareToken.trim();
  return `${MELTIN_TRACKING_ORIGIN}/track/${encodeURIComponent(token)}`;
}

export function buildDoTrackingShareMessage(
  trackUrl: string,
  passengerName?: string
): string {
  const name = passengerName?.trim();
  const header = name ? `Service of ${name}\n\n` : "";
  return `${header}📱✈️ Airport Live\n\n📍SERVICE TRACKING\n💬 CHAT WITH AGENT\n\n${trackUrl.trim()}`;
}

export function buildWhatsAppShareUrl(
  trackUrl: string,
  passengerName?: string
): string {
  const text = encodeURIComponent(
    buildDoTrackingShareMessage(trackUrl, passengerName)
  );
  return `https://wa.me/?text=${text}`;
}
