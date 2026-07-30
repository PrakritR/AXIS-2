import { renderPortalSection } from "@/lib/render-portal-section";

/** Thin server entry for explicit `src/app/portal/**` route files (Appendix E2). */
export async function renderProPortalSection(section: string, tab?: string[]) {
  return renderPortalSection("pro", section, tab);
}

/** Thin server entry for explicit `src/app/resident/**` route files. */
export async function renderResidentPortalSection(section: string, tab?: string[]) {
  return renderPortalSection("resident", section, tab);
}
