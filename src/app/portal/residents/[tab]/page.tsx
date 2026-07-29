import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function ResidentsListPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  return renderProPortalSection("residents", [tab]);
}
