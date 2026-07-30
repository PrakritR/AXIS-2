import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function CommunicationListPage({
  params,
}: {
  params: Promise<{ segment: string }>;
}) {
  const { segment } = await params;
  return renderProPortalSection("communication", [segment]);
}
