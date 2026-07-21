import { NextResponse } from "next/server";

import { initAgentsAuth } from "@/lib/auth/init-agents-auth";
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

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  await ensureAgentsAuthInitialized(supabase);

  const { data, error } = await supabase
    .from("agents_auth")
    .select("name,can_login,is_active,password");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const registeredNames = (data ?? [])
    .filter((row) => {
      if ((row as { can_login?: unknown }).can_login === false) return false;
      if ((row as { is_active?: unknown }).is_active === false) return false;
      const password = (row as { password?: unknown }).password;
      return typeof password === "string" && password.length > 0;
    })
    .map((r: { name?: unknown }) =>
      typeof r.name === "string" ? r.name.trim() : ""
    )
    .filter(Boolean);

  const pendingSignupNames = (data ?? [])
    .filter((row) => {
      if ((row as { can_login?: unknown }).can_login === false) return false;
      if ((row as { is_active?: unknown }).is_active === false) return false;
      const password = (row as { password?: unknown }).password;
      return !(typeof password === "string" && password.length > 0);
    })
    .map((r: { name?: unknown }) =>
      typeof r.name === "string" ? r.name.trim() : ""
    )
    .filter(Boolean);

  return NextResponse.json({ registeredNames, pendingSignupNames });
}
