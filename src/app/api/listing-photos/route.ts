import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function resolveUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function uploadToStorage(db: ReturnType<typeof createSupabaseServiceRoleClient>, userId: string, bytes: Buffer | Uint8Array, mime: string, ext: string) {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await db.storage.from("listing-photos").upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  const { data } = db.storage.from("listing-photos").getPublicUrl(path);
  return data.publicUrl;
}

// Accepts either:
//   multipart/form-data with a "file" field (raw binary — used for videos)
//   application/json with { dataUrl, ext }  (base64 data URL — used for images)
export async function POST(req: Request) {
  try {
    const user = await resolveUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "file required." }, { status: 400 });
      const mime = file.type || "video/mp4";
      const ext = file.name.split(".").pop() ?? mime.split("/")[1] ?? "mp4";
      const bytes = Buffer.from(await file.arrayBuffer());
      const url = await uploadToStorage(db, user.id, bytes, mime, ext);
      return NextResponse.json({ url });
    }

    // JSON path (images as base64 data URLs)
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
    const url = await uploadToStorage(db, user.id, bytes, mime, ext);
    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
