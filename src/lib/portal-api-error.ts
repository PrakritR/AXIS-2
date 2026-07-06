/** Read a JSON `{ error }` from a portal API response; tolerate plain-text 500 bodies. */
export async function readPortalApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return fallback;
  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error?.trim() || fallback;
  } catch {
    return text.trim() || fallback;
  }
}
