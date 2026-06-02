import { NextResponse } from "next/server";

import { requirePlanningAdminBearer } from "@/lib/auth/planning-admin-server";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { hasRealAssigneeAgentName } from "@/lib/planning/planning-assignee-guard";
import { serializeAssigneeSlugsToName } from "@/lib/planning/planning-team";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Body = {
  serviceId?: unknown;
  serviceDate?: unknown;
  assigneeSlugs?: unknown;
  /** Anciens `service_id` possibles (repli sans doublon). */
  lookupIds?: unknown;
  /**
   * Autorise EXPLICITEMENT le retrait d'un agent réel (croix manuelle dans l'app).
   * Par défaut `false` : aucune écriture automatique / de synchronisation ne peut
   * vider un agent déjà assigné (règle « App-First »).
   */
  allowDeassign?: unknown;
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
  const serviceDate = (() => {
    if (!serviceDateRaw) return "";
    const normalized = normalizeCanonicalDateKey(serviceDateRaw).slice(0, 10);
    // Force strict ISO YYYY-MM-DD for Postgres DATE.
    try {
      return new Date(normalized).toISOString().split("T")[0];
    } catch {
      return normalized;
    }
  })();

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

  // Retrait d'agent autorisé UNIQUEMENT sur action manuelle explicite (croix).
  const allowDeassign = b.allowDeassign === true;

  const lookupIdsRaw = (b as Body).lookupIds;
  const lookupIds = [
    serviceId,
    ...(Array.isArray(lookupIdsRaw)
      ? lookupIdsRaw.filter((x): x is string => typeof x === "string")
      : []),
  ]
    .map((id) => id.trim())
    .filter(Boolean);
  const uniqueLookupIds = [...new Set(lookupIds)];

  // On récupère l’ETA existante ET l’agent existant (sous la clé canonique ou
  // une ancienne clé) pour ne rien perdre lors de l’écriture.
  let existingEta: string | null = null;
  let existingAgentName: string | null = null;
  const legacyServiceIds = uniqueLookupIds.filter((id) => id !== serviceId);

  for (const id of uniqueLookupIds) {
    const { data: row } = await supabase
      .from("planning_assignments")
      .select("agent_name,eta_time")
      .eq("service_id", id)
      .maybeSingle();
    if (!row) continue;
    const eta = (row as { eta_time?: string | null }).eta_time ?? null;
    if (eta && !existingEta) existingEta = eta;
    const agent = (row as { agent_name?: string | null }).agent_name ?? null;
    if (!existingAgentName && hasRealAssigneeAgentName(agent)) {
      existingAgentName = agent;
    }
  }

  // `serializeAssigneeSlugsToName` renvoie `null` si plus aucun agent réel
  // (retrait/croix) : aucune virgule vide ni nom résiduel.
  const assigneeName = serializeAssigneeSlugsToName(slugs);
  const incomingHasRealAgent = hasRealAssigneeAgentName(assigneeName);

  // ───────────────────────────────────────────────────────────────────────
  // PROTECTION « App-First » (règle anti-désassignation automatique)
  // Si un agent RÉEL est déjà assigné en base et que l'écriture entrante ne
  // contient aucun agent réel (vide, ou 🚨 seul), on REFUSE STRICTEMENT
  // d'effacer — sauf retrait manuel explicite (`allowDeassign: true`, la croix).
  // Aucune synchronisation / aucun automatisme ne peut vider un agent.
  // ───────────────────────────────────────────────────────────────────────
  if (existingAgentName && !incomingHasRealAgent && !allowDeassign) {
    console.warn(
      "[planning-assignees/set] App-First : écriture sans agent réel ignorée (agent existant préservé).",
      { serviceId, existingAgentName }
    );
    return NextResponse.json({
      ok: true,
      preserved: true,
      assignment: {
        service_id: serviceId,
        agent_name: existingAgentName,
        eta_time: existingEta,
      },
    });
  }

  const payload = {
    service_id: serviceId,
    service_date: serviceDate,
    agent_name: assigneeName,
    eta_time: existingEta,
    updated_at: new Date().toISOString(),
  };

  // Nettoyage des clés legacy pour la MÊME mission, MAIS jamais au point
  // d'effacer un agent réel d'une AUTRE mission qui partagerait une clé legacy
  // (collision date+client+type+vol entre deux RDV distincts). On ne supprime
  // donc qu'une ligne legacy vide OU portant exactement l'agent qu'on réécrit.
  if (legacyServiceIds.length > 0) {
    const { data: legacyRows, error: legacyReadError } = await supabase
      .from("planning_assignments")
      .select("service_id,agent_name")
      .in("service_id", legacyServiceIds);

    if (legacyReadError) {
      console.warn("[planning-assignees/set] lecture legacy", {
        message: legacyReadError.message,
        legacyServiceIds,
      });
    }

    const newName = (assigneeName ?? "").trim();
    const deletableIds = (legacyRows ?? [])
      .filter((r) => {
        const agent = (r as { agent_name?: string | null }).agent_name ?? null;
        if (!hasRealAssigneeAgentName(agent)) return true; // ligne vide → purge OK
        return (agent ?? "").trim() === newName; // même agent → migration de clé OK
      })
      .map((r) => (r as { service_id: string }).service_id);

    if (deletableIds.length > 0) {
      const { error: cleanupError } = await supabase
        .from("planning_assignments")
        .delete()
        .in("service_id", deletableIds);
      if (cleanupError) {
        console.warn("[planning-assignees/set] nettoyage legacy", {
          message: cleanupError.message,
          deletableIds,
        });
      }
    }
  }

  // Une ligne par `service_id` (index UNIQUE) : upsert remplace `agent_name` par la chaîne sérialisée.
  const { data, error } = await supabase
    .from("planning_assignments")
    .upsert(payload, { onConflict: "service_id" })
    .select("service_id,agent_name,eta_time")
    .single();

  if (error) {
    console.error("[planning-assignees/set] Supabase upsert", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    // Workaround PostgREST "schema cache" after migrations:
    // retry once via REST with a cache-busting query param.
    const msg = error.message || "";
    if (/schema cache/i.test(msg)) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (url && key) {
        try {
          const res = await fetch(
            `${url}/rest/v1/planning_assignments?on_conflict=service_id&select=service_id,agent_name,eta_time`,
            {
              method: "POST",
              headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
                Prefer: "resolution=merge-duplicates,return=representation",
              },
              body: JSON.stringify(payload),
            }
          );
          const j: unknown = await res.json();
          if (!res.ok) {
            console.error("[planning-assignees/set] Supabase REST fallback", {
              status: res.status,
              body: j,
            });
            const em =
              j && typeof j === "object" && "message" in j
                ? String((j as { message?: unknown }).message ?? "Erreur Supabase.")
                : "Erreur Supabase.";
            return NextResponse.json({ error: em }, { status: 500 });
          }
          const arr = Array.isArray(j) ? j : [];
          const first = arr[0] ?? null;
          return NextResponse.json({ ok: true, assignment: first });
        } catch {
          // fallthrough to normal error
        }
      }
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assignment: data });
}

