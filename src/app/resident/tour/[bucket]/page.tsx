import { renderResidentPortalSection } from "@/lib/portal-section-page";

export default async function ResidentTourListPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  return renderResidentPortalSection("tour", [bucket]);
}
