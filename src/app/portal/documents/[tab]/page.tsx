import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function DocumentsTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  return renderProPortalSection("documents", [tab]);
}
