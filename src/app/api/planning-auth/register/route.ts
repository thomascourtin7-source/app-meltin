import { randomUUID } from "crypto";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { agentNameToSlug } from "@/lib/auth/agent-name-slug";
import {
  displayNameForPlanningAuthSlug,
  isAllowedPlanningAuthSlug,
  resolvePlanningAuthDisplayName,
} from "@/lib/auth/planning-auth-slugs";
import { isPlanningAssignmentOnlySlug } from "@/lib/planning/planning-team";
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

  const b = body as { slug?: unknown; password?: unknown; deviceId?: unknown };
  const slug = typeof b.slug === "string" ? b.slug.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const deviceId = typeof b.deviceId === "string" ? b.deviceId.trim() : "";

  if (!slug || isPlanningAssignmentOnlySlug(slug)) {
    return NextResponse.json({ error: "Prénom non autorisé." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 6 caractères." },
      { status: 400 }
    );
  }

  const displayName =
    displayNameForPlanningAuthSlug(slug) ??
    (await resolvePlanningAuthDisplayName(supabase, slug));
  if (!displayName) {
    return NextResponse.json({ error: "Prénom non autorisé." }, { status: 400 });
  }

  const { data: allowedRow, error: allowedErr } = await supabase
    .from("agents_auth")
    .select("name,can_login,is_active,password")
    .ilike("name", displayName)
    .maybeSingle();

  if (allowedErr) {
    return NextResponse.json({ error: allowedErr.message }, { status: 500 });
  }

  if (
    !allowedRow ||
    (allowedRow as { can_login?: boolean }).can_login === false ||
    (allowedRow as { is_active?: boolean }).is_active === false
  ) {
    if (!isAllowedPlanningAuthSlug(slug)) {
      return NextResponse.json({ error: "Prénom non autorisé." }, { status: 400 });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const sessionToken = randomUUID();

  const { data: existing, error: fetchErr } = await supabase
    .from("agents_auth")
    .select("name,password")
    .ilike("name", displayName)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (existing) {
    const storedPassword = (existing as { password?: unknown }).password;
    const hasPassword =
      typeof storedPassword === "string" && storedPassword.length > 0;
    if (hasPassword) {
      return NextResponse.json(
        {
          error: "Ce compte est déjà utilisé sur un autre appareil.",
        },
        { status: 409 }
      );
    }

    const dbName =
      typeof (existing as { name?: unknown }).name === "string"
        ? (existing as { name: string }).name.trim()
        : displayName;

    const { error: updateErr } = await supabase
      .from("agents_auth")
      .update({ password: passwordHash })
      .eq("name", dbName);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  } else {
    const { error: insErr } = await supabase.from("agents_auth").insert({
      name: displayName,
      password: passwordHash,
    });

    if (insErr) {
      const msg = (insErr.message ?? "").toLowerCase();
      if (
        insErr.code === "23505" ||
        msg.includes("duplicate") ||
        msg.includes("unique")
      ) {
        return NextResponse.json(
          {
            error: "Ce compte est déjà utilisé sur un autre appareil.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  const { error: sessErr } = await supabase.from("agents_auth_sessions").insert({
    token: sessionToken,
    name: displayName,
    device_id: deviceId || null,
  });
  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  return NextResponse.json({
    slug: agentNameToSlug(displayName),
    displayName,
    token: sessionToken,
  });
}
