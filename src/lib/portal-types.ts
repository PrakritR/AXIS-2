export type PortalKind = "manager" | "resident" | "admin";

export type PortalTab = { id: string; label: string };

export type PortalSection = {
  section: string;
  label: string;
  tabs: PortalTab[];
};

export type PortalDefinition = {
  kind: PortalKind;
  basePath: string;
  title: string;
  accent: "blue" | "teal" | "slate";
  sections: PortalSection[];
};
