import { NextResponse } from "next/server";

import { requirePlanningAdminBearer } from "@/lib/auth/planning-admin-server";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { serializeAssigneeSlugsToName } from "@/lib/planning/planning-team";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Body = {
  serviceId?: unknown;
  serviceDate?: unknown;
  assigneeSlugs?: unknown;
};

export async function POST(request: Request) {
  const admin = await requirePlanningAdminBearer(request);
  if (!admin.ok) return admin.response;

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

  const b = (body ?? {}) as Body;

  const serviceId = typeof b.serviceId === "string" ? b.serviceId.trim() : "";
  const serviceDateRaw =
    typeof b.serviceDate === "string" ? b.serviceDate.trim() : "";
  const serviceDate = serviceDateRaw
    ? normalizeCanonicalDateKey(serviceDateRaw)
    : "";

  if (!serviceId || !serviceDate) {
    return NextResponse.json(
      {
        error: "Champs requis : serviceId, serviceDate.",
      },
      { status: 400 }
    );
  }

  const slugs = Array.isArray(b.assigneeSlugs)
    ? b.assigneeSlugs.filter((x): x is string => typeof x === "string")
    : [];

  const assigneeName = serializeAssigneeSlugsToName(slugs);

  const payload = {
    service_id: serviceId,
    service_date: serviceDate,
    agent_name: assigneeName,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("planning_assignments")
    .upsert(payload, { onConflict: "service_id" })
    .select("service_id,agent_name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assignment: data });
}

