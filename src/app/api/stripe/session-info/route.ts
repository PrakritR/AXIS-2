import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return NextResponse.json({
      managerId: session.metadata?.manager_id ?? null,
      email: session.metadata?.email ?? null,
      fullName: session.metadata?.full_name ?? null,
      tier: session.metadata?.tier ?? null,
      status: session.status,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
