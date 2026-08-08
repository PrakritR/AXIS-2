import { redirect } from "next/navigation";

/** Legacy tab URLs fold into the single House details page. */
export default function ResidentMoveInTabPage() {
  redirect("/resident/move-in");
}
