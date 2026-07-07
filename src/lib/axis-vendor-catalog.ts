/** Curated vendors discoverable in the Axis catalog (before added to a manager account). */
export type AxisCatalogVendor = {
  catalogId: string;
  name: string;
  trade: string;
  city: string;
  phone: string;
  email: string;
  notes?: string;
};

export const AXIS_VENDOR_CATALOG: AxisCatalogVendor[] = [
  {
    catalogId: "axis-catalog-hvac-1",
    name: "Sound HVAC Collective",
    trade: "HVAC",
    city: "Seattle, WA",
    phone: "(206) 555-4401",
    email: "dispatch@soundhvac.example.com",
    notes: "Licensed residential HVAC — installs, tune-ups, and emergency repair.",
  },
  {
    catalogId: "axis-catalog-plumbing-1",
    name: "Emerald City Plumbing",
    trade: "Plumbing",
    city: "Bellevue, WA",
    phone: "(425) 555-1182",
    email: "jobs@emeraldcityplumb.example.com",
  },
  {
    catalogId: "axis-catalog-electrical-1",
    name: "Puget Power Pros",
    trade: "Electrical",
    city: "Tacoma, WA",
    phone: "(253) 555-9020",
    email: "service@pugetpowerpros.example.com",
  },
  {
    catalogId: "axis-catalog-cleaning-1",
    name: "Sparkle Turnover Co.",
    trade: "Cleaning",
    city: "Seattle, WA",
    phone: "(206) 555-7710",
    email: "turns@sparkleturnover.example.com",
    notes: "Move-out and recurring unit cleaning for multifamily.",
  },
  {
    catalogId: "axis-catalog-maintenance-1",
    name: "Axis Handyman Network",
    trade: "General maintenance",
    city: "Greater Seattle",
    phone: "(206) 555-3300",
    email: "workorders@axishandyman.example.com",
  },
  {
    catalogId: "axis-catalog-appliance-1",
    name: "Northwest Appliance Repair",
    trade: "Appliance repair",
    city: "Kirkland, WA",
    phone: "(425) 555-6614",
    email: "repairs@nwappliance.example.com",
  },
  {
    catalogId: "axis-catalog-landscaping-1",
    name: "Greenline Exterior Care",
    trade: "Landscaping",
    city: "Redmond, WA",
    phone: "(425) 555-2290",
    email: "crew@greenlinecare.example.com",
  },
  {
    catalogId: "axis-catalog-pest-1",
    name: "Harbor Pest Response",
    trade: "Pest control",
    city: "Seattle, WA",
    phone: "(206) 555-8844",
    email: "dispatch@harborpest.example.com",
  },
];

export function searchAxisVendorCatalog(query: string): AxisCatalogVendor[] {
  const q = query.trim().toLowerCase();
  if (!q) return AXIS_VENDOR_CATALOG;
  return AXIS_VENDOR_CATALOG.filter((row) => {
    const haystack = [row.name, row.trade, row.city, row.email, row.notes ?? ""].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

/** Map outgoing expense category codes to vendor trade labels. */
export function vendorTradeForExpenseCategory(categoryCode: string): string | null {
  const map: Record<string, string> = {
    plumbing: "Plumbing",
    cleaning: "Cleaning",
    maintenance: "General maintenance",
    materials: "General maintenance",
    service_fees: "General maintenance",
    utilities: "General maintenance",
    insurance: "General maintenance",
    management: "General maintenance",
    property_tax: "General maintenance",
    taxes: "General maintenance",
    mortgage: "General maintenance",
    other_expense: "General maintenance",
  };
  return map[categoryCode] ?? null;
}
