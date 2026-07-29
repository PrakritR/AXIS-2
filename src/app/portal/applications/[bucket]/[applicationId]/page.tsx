import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ bucket: string; applicationId: string }>;
}) {
  const { bucket, applicationId } = await params;
  return renderProPortalSection("applications", [bucket, applicationId]);
}
