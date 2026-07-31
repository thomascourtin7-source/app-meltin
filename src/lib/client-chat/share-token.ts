export function buildTrackUrl(shareToken: string, origin?: string): string {
  const base =
    (origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${base}/track/${encodeURIComponent(shareToken)}`;
}

export function buildWhatsAppShareUrl(trackUrl: string, passengerLabel: string): string {
  const text = encodeURIComponent(
    `Suivi de mission Meltin — ${passengerLabel}\n${trackUrl}`
  );
  return `https://wa.me/?text=${text}`;
}
