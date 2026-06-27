import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function resolveUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: Request) {
  try {
    const user = await resolveUser();
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
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP, and GIF images are allowed." }, { status: 400 });
    }

    const bytes = Buffer.from(b64, "base64");
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
    }

    const ext = body.ext ?? (mime.split("/")[1] ?? "jpg");
    const path = `bug-feedback/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const db = createSupabaseServiceRoleClient();
    const { error } = await db.storage.from("listing-photos").upload(path, bytes, { contentType: mime, upsert: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = db.storage.from("listing-photos").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
