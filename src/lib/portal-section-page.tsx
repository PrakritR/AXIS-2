import { renderPortalSection } from "@/lib/render-portal-section";

/** Thin server entry for explicit `src/app/portal/**` route files (Appendix E2). */
export async function renderProPortalSection(section: string, tab?: string[]) {
  return renderPortalSection("pro", section, tab);
}
