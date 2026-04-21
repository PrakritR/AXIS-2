import { renderPortalSection } from "@/lib/render-portal-section";
import { notFound } from "next/navigation";

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string; tab?: string[] }>;
}) {
  const { section: rawSection, tab } = await params;
  const section = typeof rawSection === "string" ? rawSection.trim() : "";
  if (!section) notFound();
  const cleanTab = Array.isArray(tab) ? tab.filter((s) => typeof s === "string" && s.trim().length > 0) : undefined;
  return renderPortalSection("admin", section, cleanTab);
}
