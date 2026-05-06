import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  const serviceIdsRaw = (body as { serviceIds?: unknown })?.serviceIds;
  const serviceIds = Array.isArray(serviceIdsRaw)
    ? [...new Set(
        serviceIdsRaw
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      )]
    : [];

  if (serviceIds.length === 0) {
    return NextResponse.json({ assigneesByServiceId: {} });
  }

  const { data, error } = await supabase
    .from("planning_assignments")
    .select("service_id,agent_name")
    .in("service_id", serviceIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const assigneesByServiceId: Record<string, string> = {};
  for (const r of data ?? []) {
    const serviceId = (r as { service_id?: unknown }).service_id;
    const agentName = (r as { agent_name?: unknown }).agent_name;
    if (typeof serviceId !== "string") continue;
    if (typeof agentName !== "string" || !agentName.trim()) continue;
    assigneesByServiceId[serviceId] = agentName.trim();
  }

  return NextResponse.json({ assigneesByServiceId });
}

