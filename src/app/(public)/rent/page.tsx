import { RevealOnView } from "@/components/motion/reveal-on-view";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const links = [
  { title: "Rental listings", desc: "Browse mock inventory with realistic cards.", href: "/rent/listings" },
  { title: "Apply", desc: "Multi-step application shell (no backend).", href: "/rent/apply" },
  {
    title: "Schedule tour",
    desc: "Tours, messages, and availability placeholders.",
    href: "/rent/tours-contact",
  },
  { title: "FAQ", desc: "Common renter questions.", href: "/rent/faq" },
  { title: "Contact", desc: "Dedicated contact form.", href: "/rent/contact" },
];

export default function RentHubPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <RevealOnView>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Rent with Axis</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Everything renters need</h1>
        <p className="mt-3 max-w-prose text-sm text-muted">
          This hub links to every renter-facing page in the scaffold. Each route exists so you can click through the
          whole information architecture.
        </p>
      </RevealOnView>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {links.map((l, i) => (
          <RevealOnView key={l.href} delayMs={i * 70}>
            <Card className="p-6">
              <p className="text-lg font-semibold">{l.title}</p>
              <p className="mt-2 text-sm text-muted">{l.desc}</p>
              <div className="mt-5">
                <Link href={l.href} className="inline-block transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-px">
                  <Button type="button">Open</Button>
                </Link>
              </div>
            </Card>
          </RevealOnView>
        ))}
      </div>
    </div>
  );
}
