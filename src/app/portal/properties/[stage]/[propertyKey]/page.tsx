import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ stage: string; propertyKey: string }>;
}) {
  const { stage, propertyKey } = await params;
  return renderProPortalSection("properties", [stage, propertyKey]);
}
