"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PillTabs } from "@/components/ui/tabs";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useState } from "react";
import Link from "next/link";

const tiers = [
  {
    name: "Free tier",
    priceMonthly: "Free",
    priceAnnual: "Free",
    blurb: "House posting only.",
    features: [
      "House posting only",
      "No rent collection access",
      "No announcements access",
      "No work order system",
    ],
    cta: "Choose free",
  },
  {
    name: "Pro tier",
    priceMonthly: "$20 / month",
    priceAnnual: "$16 / month",
    blurb: "For 1–2 houses.",
    features: [
      "1–2 houses",
      "Rent collection access",
      "Announcements access",
      "Work order system access",
    ],
    cta: "Choose pro",
  },
  {
    name: "Business tier",
    priceMonthly: "$200 / month",
    priceAnnual: "$160 / month",
    blurb: "For 10+ houses.",
    features: [
      "10+ houses",
      "Rent collection access",
      "Announcements access",
      "Work order system access",
    ],
    cta: "Choose business",
  },
];

export default function PartnerPricingPage() {
  const { showToast } = useAppUi();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted">
          Toggle billing cadence — numbers are placeholders for the scaffold.
        </p>
        <div className="mx-auto mt-6 max-w-md">
          <PillTabs
            items={[
              { id: "monthly", label: "Monthly" },
              { id: "annual", label: "Annual (20% off)" },
            ]}
            activeId={billing}
            onChange={(id) => setBilling(id as "monthly" | "annual")}
          />
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {tiers.map((t) => (
          <Card key={t.name} className="p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.name}</p>
            <p className="mt-3 text-3xl font-semibold">
              {billing === "monthly" ? t.priceMonthly : t.priceAnnual}
            </p>
            <p className="mt-2 text-sm text-muted">{t.blurb}</p>
            <ul className="mt-6 space-y-2 text-sm text-muted">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="font-semibold text-primary">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button type="button" className="mt-8 w-full" onClick={() => showToast(`${t.cta} (demo)`)}>
              {t.cta}
            </Button>
          </Card>
        ))}
      </div>

      <Card className="mt-10 p-8 text-center">
        <CardHeader
          title="Chosen a plan?"
          subtitle="Open the partner signup form to enter details and continue to checkout or free-tier setup."
        />
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button type="button" onClick={() => showToast("Partner signup: coming soon")}>
            Open partner signup
          </Button>
          <Link href="/auth/sign-in">
            <Button type="button" variant="outline">
              Manager login
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
