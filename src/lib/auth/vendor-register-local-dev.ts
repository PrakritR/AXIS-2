/** Never expose signup confirmation tokens in HTTP responses outside true local dev. */
export function mayLogVendorConfirmLinkLocally(req: Request): boolean {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") return false;
  try {
    const host = new URL(req.url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
