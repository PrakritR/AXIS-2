import { redirect } from "next/navigation";

/**
 * Consolidated into the single portal sign-in — role is resolved after auth and new
 * residents link to their application by email. To apply for housing, browse /rent/browse.
 */
export default function ResidentAuthPage() {
  redirect("/auth/sign-in");
}
