import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ bucket: string; workOrderId: string }>;
}) {
  const { bucket, workOrderId } = await params;
  return renderProPortalSection("services", ["work-orders", bucket, workOrderId]);
}
