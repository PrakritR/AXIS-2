import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ direction: string; bucket: string; paymentId: string }>;
}) {
  const { direction, bucket, paymentId } = await params;
  return renderProPortalSection("payments", [direction, bucket, paymentId]);
}
