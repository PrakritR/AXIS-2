import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function DocumentsRecordPage({
  params,
}: {
  params: Promise<{ tab: string; recordId: string }>;
}) {
  const { tab, recordId } = await params;
  return renderProPortalSection("documents", [tab, recordId]);
}
