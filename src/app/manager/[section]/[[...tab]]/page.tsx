import { renderPortalSection } from "@/lib/render-portal-section";

export default async function ManagerSectionPage({
  params,
}: {
  params: Promise<{ section: string; tab?: string[] }>;
}) {
  const { section, tab } = await params;
  return renderPortalSection("manager", section, tab);
}
