import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function ResidentDetailTabPage({
  params,
}: {
  params: Promise<{ tab: string; residentId: string; detailTab: string }>;
}) {
  const { tab, residentId, detailTab } = await params;
  return renderProPortalSection("residents", [tab, residentId, detailTab]);
}
