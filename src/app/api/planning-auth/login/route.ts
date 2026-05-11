import { randomUUID } from "crypto";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { slugFromDisplayName } from "@/lib/auth/planning-auth-slugs";
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

  const b = body as { name?: unknown; password?: unknown; deviceId?: unknown };
  const nameRaw = typeof b.name === "string" ? b.name.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const deviceId = typeof b.deviceId === "string" ? b.deviceId.trim() : "";

  if (!nameRaw) {
    return NextResponse.json({ error: "Prénom requis." }, { status: 400 });
  }

  // Insensible à la casse : "test" ou "Test" doivent fonctionner.
  const { data: row, error: selErr } = await supabase
    .from("agents_auth")
    .select("name, password")
    .ilike("name", nameRaw)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  if (
    !row ||
    typeof (row as { password?: unknown }).password !== "string"
  ) {
    return NextResponse.json(
      { error: "Mot de passe incorrect." },
      { status: 401 }
    );
  }

  const storedHash = (row as { password: string }).password;
  const match = await bcrypt.compare(password, storedHash);
  if (!match) {
    return NextResponse.json(
      { error: "Mot de passe incorrect." },
      { status: 401 }
    );
  }

  const dbName = typeof (row as { name?: unknown }).name === "string"
    ? (row as { name: string }).name.trim()
    : nameRaw;

  const slug = slugFromDisplayName(dbName);
  if (!slug) {
    return NextResponse.json(
      { error: "Prénom non reconnu pour cette application." },
      { status: 400 }
    );
  }

  const displayName = dbName;
  const sessionToken = randomUUID();

  // Session multi-appareils : enregistre un token indépendant (ne déconnecte pas les autres).
  const { error: sessErr } = await supabase.from("agents_auth_sessions").insert({
    token: sessionToken,
    name: dbName,
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
