import { NextResponse } from "next/server";

import { agentNameToSlug } from "@/lib/auth/agent-name-slug";
import { initAgentsAuth } from "@/lib/auth/init-agents-auth";
import { requirePlanningSuperAdminBearer } from "@/lib/auth/planning-super-admin-server";
import {
  buildManagedAgentRows,
  isProtectedSuperAdminAgentName,
  type AgentsAuthRow,
} from "@/lib/planning/planning-agent-catalog";
import { planningDisplayNameEquals } from "@/lib/planning/planning-team";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

let initAgentsAuthPromise: Promise<void> | null = null;

async function ensureAgentsAuthInitialized(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>
): Promise<void> {
  if (!initAgentsAuthPromise) {
    initAgentsAuthPromise = (async () => {
      try {
        await initAgentsAuth(supabase);
      } catch (error) {
        console.error("[agents_auth] Initialisation ignorée :", error);
      }
    })();
  }
  await initAgentsAuthPromise;
}

async function loadAgentsAuthRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>
): Promise<AgentsAuthRow[]> {
  await ensureAgentsAuthInitialized(supabase);
  const { data, error } = await supabase
    .from("agents_auth")
    .select("name,role,can_login,is_active,password")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentsAuthRow[];
}

export async function GET(request: Request) {
  const auth = await requirePlanningSuperAdminBearer(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  try {
    const rows = await loadAgentsAuthRows(supabase);
    return NextResponse.json({ agents: buildManagedAgentRows(rows) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur chargement agents." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePlanningSuperAdminBearer(request);
  if (!auth.ok) return auth.response;

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

  const nameRaw = (body as { name?: unknown })?.name;
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name || name.length < 2) {
    return NextResponse.json(
      { error: "Prénom invalide (2 caractères minimum)." },
      { status: 400 }
    );
  }

  try {
    const rows = await loadAgentsAuthRows(supabase);
    if (
      rows.some((row) =>
        planningDisplayNameEquals(String(row.name ?? ""), name)
      )
    ) {
      return NextResponse.json(
        { error: "Un agent avec ce prénom existe déjà." },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("agents_auth").insert({
      name,
      password: null,
      email: null,
      role: "agent",
      can_login: true,
      is_active: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nextRows = await loadAgentsAuthRows(supabase);
    return NextResponse.json({
      ok: true,
      slug: agentNameToSlug(name),
      agents: buildManagedAgentRows(nextRows),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Création impossible." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePlanningSuperAdminBearer(request);
  if (!auth.ok) return auth.response;

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

  const b = body as { name?: unknown; role?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const roleRaw = typeof b.role === "string" ? b.role.trim().toLowerCase() : "";
  if (!name) {
    return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  }
  if (roleRaw !== "admin" && roleRaw !== "agent") {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }

  if (isProtectedSuperAdminAgentName(name) && roleRaw !== "admin") {
    return NextResponse.json(
      { error: "Impossible de retirer les droits admin de ce compte." },
      { status: 403 }
    );
  }

  const { data: existing, error: fetchError } = await supabase
    .from("agents_auth")
    .select("name,is_active")
    .ilike("name", name)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing || (existing as { is_active?: boolean }).is_active === false) {
    return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  }

  const dbName =
    typeof (existing as { name?: unknown }).name === "string"
      ? (existing as { name: string }).name
      : name;

  const { error } = await supabase
    .from("agents_auth")
    .update({ role: roleRaw })
    .eq("name", dbName);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const nextRows = await loadAgentsAuthRows(supabase);
    return NextResponse.json({ ok: true, agents: buildManagedAgentRows(nextRows) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Mise à jour impossible." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requirePlanningSuperAdminBearer(request);
  if (!auth.ok) return auth.response;

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

  const name = typeof (body as { name?: unknown })?.name === "string"
    ? (body as { name: string }).name.trim()
    : "";
  if (!name) {
    return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  }

  if (isProtectedSuperAdminAgentName(name)) {
    return NextResponse.json(
      { error: "Ce compte ne peut pas être supprimé." },
      { status: 403 }
    );
  }

  const { data: existing, error: fetchError } = await supabase
    .from("agents_auth")
    .select("name")
    .ilike("name", name)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  }

  const dbName =
    typeof (existing as { name?: unknown }).name === "string"
      ? (existing as { name: string }).name
      : name;

  const { error: sessionError } = await supabase
    .from("agents_auth_sessions")
    .delete()
    .ilike("name", dbName);
  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  const { error } = await supabase
    .from("agents_auth")
    .update({
      is_active: false,
      can_login: false,
      password: null,
      role: "agent",
    })
    .eq("name", dbName);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const nextRows = await loadAgentsAuthRows(supabase);
    return NextResponse.json({ ok: true, agents: buildManagedAgentRows(nextRows) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Suppression impossible." },
      { status: 500 }
    );
  }
}
