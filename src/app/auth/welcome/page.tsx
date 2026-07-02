import { redirect } from "next/navigation";

/** Consolidated into the single portal sign-in (web + native shell entry). */
export default function AuthWelcomePage() {
  redirect("/auth/sign-in");
}
