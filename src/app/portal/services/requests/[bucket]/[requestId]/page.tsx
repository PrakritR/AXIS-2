import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function ServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ bucket: string; requestId: string }>;
}) {
  const { bucket, requestId } = await params;
  return renderProPortalSection("services", ["requests", bucket, requestId]);
}
