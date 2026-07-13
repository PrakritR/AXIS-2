import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/notification-preferences";

export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** GET — the signed-in user's notification channel preferences. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const db = createSupabaseServiceRoleClient();
  const preferences = await loadNotificationPreferences(db, user.id);
  return NextResponse.json({ preferences });
}

/**
 * PATCH — merge the posted (partial) preferences into the user's current set
 * and persist. Missing categories/channels are preserved; normalization clamps
 * the shape and re-forces inbox on.
 */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch = (body.preferences ?? body) as Record<string, unknown>;

  const db = createSupabaseServiceRoleClient();
  const current = await loadNotificationPreferences(db, user.id);

  // Deep-merge per category so a partial patch (e.g. just { payments: { sms: true } })
  // does not wipe the other categories/channels.
  const merged: Record<string, unknown> = { ...current };
  if (patch && typeof patch === "object") {
    for (const [category, channels] of Object.entries(patch)) {
      if (channels && typeof channels === "object") {
        merged[category] = {
          ...((current as Record<string, unknown>)[category] as Record<string, unknown> | undefined),
          ...(channels as Record<string, unknown>),
        };
      }
    }
  }

  const preferences = await saveNotificationPreferences(db, user.id, merged);
  return NextResponse.json({ preferences });
}
