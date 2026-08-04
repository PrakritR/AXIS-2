import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function PromotionDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return renderProPortalSection("promotion", [decodeURIComponent(assetId)]);
}
