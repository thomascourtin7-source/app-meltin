import { randomUUID } from "crypto";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import {
  displayNameForPlanningAuthSlug,
  isAllowedPlanningAuthSlug,
} from "@/lib/auth/planning-auth-slugs";
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

  if (!slug || !isAllowedPlanningAuthSlug(slug)) {
    return NextResponse.json({ error: "Prénom non autorisé." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 6 caractères." },
      { status: 400 }
    );
  }

  const displayName = displayNameForPlanningAuthSlug(slug);
  if (!displayName) {
    return NextResponse.json({ error: "Prénom non autorisé." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const sessionToken = randomUUID();

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

  const { error: sessErr } = await supabase.from("agents_auth_sessions").insert({
    token: sessionToken,
    name: displayName,
    device_id: deviceId || null,
  });
  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  return NextResponse.json({
    slug,
    displayName,
    token: sessionToken,
  });
}
