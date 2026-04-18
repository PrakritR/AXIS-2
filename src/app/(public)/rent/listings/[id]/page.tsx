import { RentListingDetailClient } from "@/components/marketing/rent-listing-detail-client";

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <RentListingDetailClient params={params} />;
}
