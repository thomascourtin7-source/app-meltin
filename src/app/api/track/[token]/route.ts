import { NextResponse } from "next/server";

import { loadTrackPayloadByToken } from "@/lib/client-chat/track-server";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const payload = await loadTrackPayloadByToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid tracking link." }, { status: 404 });
  }
  return NextResponse.json(payload);
}
