import { NextResponse } from "next/server";

import { requirePlanningAdminBearer } from "@/lib/auth/planning-admin-server";

export async function POST(request: Request) {
  const r = await requirePlanningAdminBearer(request);
  if (!r.ok) return r.response;
  return NextResponse.json({ ok: true });
}
