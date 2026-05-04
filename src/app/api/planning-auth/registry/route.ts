import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase.from("agents_auth").select("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const registeredNames = (data ?? [])
    .map((r: { name?: unknown }) =>
      typeof r.name === "string" ? r.name.trim() : ""
    )
    .filter(Boolean);

  return NextResponse.json({ registeredNames });
}
