export type PortalKind = "pro" | "manager" | "resident" | "admin" | "vendor";

export type PortalTab = { id: string; label: string };

export type PortalSection = {
  section: string;
  label: string;
  tabs: PortalTab[];
  /** When true, nav shows the section but content is paywalled for the current plan. */
  tierLocked?: boolean;
};

export type PortalDefinition = {
  kind: PortalKind;
  basePath: string;
  title: string;
  accent: "blue" | "teal" | "slate";
  sections: PortalSection[];
};
