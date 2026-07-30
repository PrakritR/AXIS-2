import { renderResidentPortalSection } from "@/lib/portal-section-page";

export default async function ResidentMoveInTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  return renderResidentPortalSection("move-in", [tab]);
}
