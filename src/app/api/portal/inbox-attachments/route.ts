import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  INBOX_ATTACHMENTS_BUCKET,
  contentTypeForInboxAttachmentPath,
  inboxAttachmentServeUrl,
  inboxAttachmentStoragePrefix,
  isInboxAttachmentPath,
  sanitizeInboxAttachmentExt,
  userCanAccessInboxAttachment,
} from "@/lib/inbox-attachments.server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
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

export async function GET(req: Request) {
  try {
    const user = await resolveUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const path = new URL(req.url).searchParams.get("path")?.trim() ?? "";
    if (!path || !isInboxAttachmentPath(path)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const db = createSupabaseServiceRoleClient();
    const userEmail = String(user.email ?? "").trim().toLowerCase();
    const admin = await isAdminUser(user.id);
    if (
      !(await userCanAccessInboxAttachment(db, {
        userId: user.id,
        userEmail,
        path,
        isAdmin: admin,
      }))
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const { data, error } = await db.storage.from(INBOX_ATTACHMENTS_BUCKET).download(path);
    if (error || !data) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const bytes = Buffer.from(await data.arrayBuffer());
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentTypeForInboxAttachmentPath(path),
        "Content-Disposition": `inline; filename="${path.split("/").pop()?.replace(/"/g, "") ?? "attachment"}"`,
        // Stored objects are immutable (unique `${Date.now()}-${uuid}` filename),
        // so the browser may keep them for the session instead of re-fetching the
        // bytes from Storage on every thread render. `private` keeps them out of
        // shared caches; every cache miss still re-authorizes above.
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await resolveUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    if (
      !rateLimit(`inbox-attach:user:${user.id}`, 20, 60_000).ok ||
      !rateLimit(`inbox-attach:ip:${clientIpFrom(req)}`, 40, 60_000).ok
    ) {
      return NextResponse.json({ error: "Too many uploads. Please slow down." }, { status: 429 });
    }

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

    const ext = sanitizeInboxAttachmentExt(body.ext, mime);
    if (!ext) {
      return NextResponse.json({ error: "Invalid file extension." }, { status: 400 });
    }
    const path = `${inboxAttachmentStoragePrefix(user.id)}${Date.now()}-${randomUUID()}.${ext}`;
    const db = createSupabaseServiceRoleClient();
    const { error } = await db.storage.from(INBOX_ATTACHMENTS_BUCKET).upload(path, bytes, {
      contentType: mime,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ url: inboxAttachmentServeUrl(path) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
