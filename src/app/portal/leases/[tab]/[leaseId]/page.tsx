import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function LeaseDetailPage({
  params,
}: {
  params: Promise<{ tab: string; leaseId: string }>;
}) {
  const { tab, leaseId } = await params;
  return renderProPortalSection("leases", [tab, leaseId]);
}
