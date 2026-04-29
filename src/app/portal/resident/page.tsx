import { redirect } from "next/navigation";

export default function LegacyPortalResidentPage() {
  redirect("/resident/dashboard");
}
