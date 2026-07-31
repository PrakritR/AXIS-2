import { renderProPortalSection } from "@/lib/portal-section-page";

export default async function CalendarViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  return renderProPortalSection("calendar", [view]);
}
