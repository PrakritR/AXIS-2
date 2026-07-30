import { renderResidentPortalSection } from "@/lib/portal-section-page";

export default async function ResidentPaymentsListPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  return renderResidentPortalSection("payments", [bucket]);
}
