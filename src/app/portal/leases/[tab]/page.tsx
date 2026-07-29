import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function LeasesListPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  return renderProPortalSection("leases", [tab]);
}
