import { redirect } from "next/navigation";

export default async function ProPortalSectionPage({
  params,
}: {
  params: Promise<{ section: string; tab?: string[] }>;
}) {
  const { section, tab } = await params;
  const tabPath = tab?.length ? `/${tab.join("/")}` : "";
  redirect(`/portal/${section}${tabPath}`);
}
