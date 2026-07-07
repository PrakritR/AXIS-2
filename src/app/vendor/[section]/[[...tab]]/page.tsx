import { renderPortalSection } from "@/lib/render-portal-section";

export default async function VendorSectionPage({
  params,
}: {
  params: Promise<{ section: string; tab?: string[] }>;
}) {
  const { section, tab } = await params;
  return renderPortalSection("vendor", section, tab);
}
