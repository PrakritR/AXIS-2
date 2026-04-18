export type MockProperty = {
  id: string;
  title: string;
  tagline: string;
  address: string;
  /** Approximate ZIP for demo radius filtering from home search */
  zip: string;
  neighborhood: string;
  beds: number;
  baths: number;
  rentLabel: string;
  available: string;
  petFriendly: boolean;
  /** Same id for all units in one building (tours, grouping) */
  buildingId: string;
  buildingName: string;
  unitLabel: string;
};

export type MockRow = Record<string, string>;
