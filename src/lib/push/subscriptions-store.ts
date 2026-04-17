export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

/**
 * Stockage en mémoire pour le développement. En production, persister
 * (PostgreSQL, Redis, Upstash, etc.) et associer aux utilisateurs.
 */
const subscriptions = new Map<string, PushSubscriptionJSON>();

export function saveSubscription(id: string, sub: PushSubscriptionJSON): void {
  subscriptions.set(id, sub);
}

export function getAllSubscriptions(): PushSubscriptionJSON[] {
  return [...subscriptions.values()];
}
