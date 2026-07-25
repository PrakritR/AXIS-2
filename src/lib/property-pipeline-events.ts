/**
 * Leaf module for property-pipeline event names.
 *
 * These are plain string constants with NO imports, so they can be pulled into
 * any module without participating in an import cycle. Keeping them here (rather
 * than in `demo-property-pipeline.ts`) breaks the manager-portfolio-access ↔
 * demo-property-pipeline TDZ: `MANAGER_PORTFOLIO_REFRESH_EVENTS` in
 * `manager-portfolio-access.ts` reads `PROPERTY_PIPELINE_EVENT` at module-eval
 * time, and the property-ordering cycle
 * (demo-property-pipeline → persisted-property-records → demo-admin-property-inventory
 * → manager-portfolio-access → demo-property-pipeline) meant the const could be
 * accessed before its initializer ran. A leaf with no imports is always fully
 * evaluated before any importer's body executes.
 */

export const PROPERTY_PIPELINE_EVENT = "axis-property-pipeline";
