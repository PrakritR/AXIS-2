import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function WorkOrdersListPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  return renderProPortalSection("services", ["work-orders", bucket]);
}
