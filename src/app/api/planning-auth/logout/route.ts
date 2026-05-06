import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const token = m?.[1]?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ ok: true });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true });
  }

  await supabase.from("agents_auth_sessions").delete().eq("token", token);

  return NextResponse.json({ ok: true });
}
