import { redirect } from "next/navigation";

/** Consolidated into the single portal sign-in — role is resolved after auth. */
export default function ManagerAuthPage() {
  redirect("/auth/sign-in");
}
