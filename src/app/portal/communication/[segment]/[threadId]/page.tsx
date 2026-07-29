import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function CommunicationThreadPage({
  params,
}: {
  params: Promise<{ segment: string; threadId: string }>;
}) {
  const { segment, threadId } = await params;
  return renderProPortalSection("communication", [segment, threadId]);
}
