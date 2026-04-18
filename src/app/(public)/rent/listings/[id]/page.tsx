import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { getListingRichContent } from "@/data/listing-rich-content";
import { mockProperties } from "@/data/mock-properties";
import { notFound } from "next/navigation";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = mockProperties.find((p) => p.id === id);
  if (!property) notFound();

  const rich = getListingRichContent(property);

  return <ListingDetailSections property={property} rich={rich} />;
}
