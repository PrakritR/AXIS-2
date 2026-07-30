import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function ApplicationsListPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  return renderProPortalSection("applications", [bucket]);
}
