import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Each upload is a single base64 data URL; the client sends one file at a time.
// Returns { url: string } on success.
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json()) as { dataUrl?: string; ext?: string };
    const dataUrl = body.dataUrl;
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return NextResponse.json({ error: "dataUrl required." }, { status: 400 });
    }

    const [header, b64] = dataUrl.split(",");
    if (!header || !b64) return NextResponse.json({ error: "Invalid data URL." }, { status: 400 });

    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "image/jpeg";
    const ext = body.ext ?? (mime.split("/")[1] ?? "jpg");
    const bytes = Buffer.from(b64, "base64");

    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const db = createSupabaseServiceRoleClient();
    const { error } = await db.storage.from("listing-photos").upload(path, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: urlData } = db.storage.from("listing-photos").getPublicUrl(path);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
