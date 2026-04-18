import { RentListingsView, parseListingsSearchFromParams } from "@/components/marketing/rent-listings-view";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstString(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default async function ListingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = parseListingsSearchFromParams(sp, firstString);
  return (
    <RentListingsView
      zipRaw={parsed.zipRaw}
      radiusMiles={parsed.radiusMiles}
      moveIn={parsed.moveIn}
      moveOut={parsed.moveOut}
      maxBudgetNum={parsed.maxBudgetNum}
      bathroom={parsed.bathroom}
    />
  );
}
