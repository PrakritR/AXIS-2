type TourLinkFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok">>;

/** Link newly-booked inquiries to the signed-in account (resident role ensured server-side). */
export async function linkBookedToursToSignedInResident(
  inquiryIds: string[],
  request: TourLinkFetch = fetch,
): Promise<boolean> {
  const ids = [...new Set(inquiryIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return true;
  const results = await Promise.all(
    ids.map(async (tourInquiryId) => {
      try {
        const response = await request("/api/auth/link-tour-inquiry", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tourInquiryId }),
        });
        return response.ok;
      } catch {
        return false;
      }
    }),
  );
  return results.every(Boolean);
}

/** Add resident access when missing, then land in the resident portal. */
export async function ensureSignedInResidentPortal(
  redirectTo: string,
  options?: { contactEmail?: string; phone?: string },
): Promise<{ ok: true; redirectTo: string } | { ok: false; error?: string }> {
  const next = redirectTo.trim().startsWith("/") ? redirectTo.trim() : "/resident/dashboard";
  try {
    const res = await fetch("/api/auth/create-resident-account", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirectTo: next,
        ...(options?.contactEmail ? { contactEmail: options.contactEmail } : {}),
        ...(options?.phone ? { phone: options.phone } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { redirectTo?: string; error?: string };
    if (!res.ok) return { ok: false, error: data.error };
    const target =
      typeof data.redirectTo === "string" && data.redirectTo.startsWith("/") ? data.redirectTo : next;
    return { ok: true, redirectTo: target };
  } catch {
    return { ok: false };
  }
}

/** Promote, link booked inquiries, and redirect into the resident Tours tab. */
export async function completeSignedInTourBooking(
  inquiryIds: string[],
  redirectTo = "/resident/tour/pending",
): Promise<{ ok: true; redirectTo: string } | { ok: false; error?: string }> {
  const ids = [...new Set(inquiryIds.map((id) => id.trim()).filter(Boolean))];
  const firstId = ids[0] ?? "";
  const next = new URL(redirectTo, "http://local");
  if (firstId) next.searchParams.set("link_tour", firstId);
  const target = `${next.pathname}${next.search}`;

  const ensured = await ensureSignedInResidentPortal(target);
  if (!ensured.ok) {
    return { ok: false, error: ensured.error ?? "Could not open your resident tour list." };
  }

  if (ids.length > 0) {
    const linked = await linkBookedToursToSignedInResident(ids);
    if (!linked) {
      return { ok: false, error: "Your tour was booked but could not be linked to your account yet." };
    }
  }

  return { ok: true, redirectTo: ensured.redirectTo };
}
