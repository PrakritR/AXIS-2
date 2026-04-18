import { renderPortalSection } from "@/lib/render-portal-section";

export default async function ResidentSectionPage({
  params,
}: {
  params: Promise<{ section: string; tab?: string[] }>;
}) {
  const { section, tab } = await params;
  return renderPortalSection("resident", section, tab);
}
