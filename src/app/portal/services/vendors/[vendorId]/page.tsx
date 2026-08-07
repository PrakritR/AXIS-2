import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId } = await params;
  return renderProPortalSection("services", ["vendors", vendorId]);
}
