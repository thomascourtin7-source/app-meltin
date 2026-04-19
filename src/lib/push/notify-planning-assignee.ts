import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/notifications";

function normSender(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Envoie une notification push uniquement aux abonnés dont `user_name`
 * correspond au membre ciblé (ex. « Simon », comme après « S'enregistrer »).
 */
export async function notifyPlanningAssigneeSubscribers(
  targetDisplayName: string,
  payload: { title: string; body: string }
): Promise<{ sent: number; failed: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { sent: 0, failed: 0 };

  const want = normSender(targetDisplayName);
  if (!want) return { sent: 0, failed: 0 };

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_name");

  if (error || !rows?.length) return { sent: 0, failed: 0 };

  const targets = rows.filter(
    (r) => normSender(String(r.user_name ?? "")) === want
  );

  let sent = 0;
  let failed = 0;

  for (const row of targets) {
    const result = await sendPushNotification(
      {
        endpoint: row.endpoint as string,
        keys: {
          p256dh: row.p256dh as string,
          auth: row.auth as string,
        },
      },
      payload.title,
      payload.body,
      "/",
      { variant: "planning" }
    );
    if (result.ok) sent++;
    else failed++;
  }

  return { sent, failed };
}
