/** Client helper to remove a PropPlane-synced tour from Google Calendar and local planned events. */
export async function deleteProplaneGoogleTourFromServer(
  googleEventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const eventId = googleEventId.trim();
  if (!eventId) return { ok: false, error: "Missing calendar event id." };
  try {
    const res = await fetch(`/api/portal/google-calendar/events?eventId=${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "Could not delete calendar event." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete calendar event." };
  }
}
