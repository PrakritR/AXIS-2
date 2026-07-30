import { renderResidentPortalSection } from "@/lib/portal-section-page";

export default async function ResidentApplicationDetailPage({
  params,
}: {
  params: Promise<{ bucket: string; applicationId: string }>;
}) {
  const { bucket, applicationId } = await params;
  return renderResidentPortalSection("applications", [bucket, applicationId]);
}
