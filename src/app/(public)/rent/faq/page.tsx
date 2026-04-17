import { Card } from "@/components/ui/card";

const items = [
  {
    q: "Is this connected to a real database?",
    a: "Not yet. This is a complete navigation + UI shell with mock content.",
  },
  {
    q: "Can I pay rent here?",
    a: "Rent payments are demo-only until Stripe (or your processor) is integrated.",
  },
  {
    q: "How do tours work?",
    a: "Tour scheduling UI exists; calendar sync and notifications are placeholders.",
  },
  {
    q: "What about pets?",
    a: "Pet policy is shown on cards; enforcement happens in your leasing workflow later.",
  },
];

export default function RentFaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Renter FAQ</h1>
      <p className="mt-2 text-sm text-muted">Straight answers for a demo walkthrough.</p>
      <div className="mt-8 space-y-4">
        {items.map((it) => (
          <Card key={it.q} className="p-6">
            <p className="text-sm font-semibold">{it.q}</p>
            <p className="mt-2 text-sm text-muted">{it.a}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
