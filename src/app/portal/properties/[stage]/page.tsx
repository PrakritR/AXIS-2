import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function PropertiesListPage({
  params,
}: {
  params: Promise<{ stage: string }>;
}) {
  const { stage } = await params;
  return renderProPortalSection("properties", [stage]);
}
