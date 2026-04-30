import { renderPortalSection } from "@/lib/render-portal-section";

export default async function PropertyPortalSectionPage({
  params,
}: {
  params: Promise<{ section: string; tab?: string[] }>;
}) {
  const { section, tab } = await params;
  return renderPortalSection("pro", section, tab);
}
