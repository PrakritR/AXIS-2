import { redirect } from "next/navigation";

/** Cancel URL target for Stripe Checkout (`/pricing`). */
export default function PricingPage() {
  redirect("/partner/pricing");
}
