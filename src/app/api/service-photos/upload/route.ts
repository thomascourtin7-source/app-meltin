import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 500 }
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "FormData invalide." }, { status: 400 });
    }

    const spreadsheetId = String(form.get("spreadsheetId") ?? "").trim();
    const serviceId = String(form.get("serviceId") ?? "").trim();
    const fileNameRaw = String(form.get("fileName") ?? "").trim();
    const file = form.get("file");

    if (!spreadsheetId || !serviceId || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Champs requis manquants (spreadsheetId, serviceId, file)." },
        { status: 400 }
      );
    }

    const bucket = "service-photos";

    function slugifyPart(input: string): string {
      return (input || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\\\/|:\s]+/g, "-")
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    const safeSheet = slugifyPart(spreadsheetId) || "sheet";
    const safeService = slugifyPart(serviceId) || "service";
    const safeFileName = slugifyPart(fileNameRaw) || `photo-${Date.now()}.png`;

    const path = `${safeSheet}/${safeService}/${safeFileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, {
        upsert: true,
        contentType: file.type || "image/png",
      });

    if (upErr) {
      console.error("[service-photos/upload] upload error", upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = data?.publicUrl || "";
    if (!publicUrl) {
      return NextResponse.json(
        { error: "URL publique indisponible (bucket non public ?)." },
        { status: 500 }
      );
    }

    return NextResponse.json({ publicUrl, path });
  } catch (e) {
    console.error("[service-photos/upload] unhandled", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

