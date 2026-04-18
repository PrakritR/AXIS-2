import { RentListingDetailClient } from "@/components/marketing/rent-listing-detail-client";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RentListingDetailClient id={id} />;
}
