import { renderResidentPortalSection } from "@/lib/portal-section-page";

export default async function ResidentApplicationsListPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  return renderResidentPortalSection("applications", [bucket]);
}
