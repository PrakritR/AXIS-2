import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function ServiceRequestsListPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  return renderProPortalSection("services", ["requests", bucket]);
}
