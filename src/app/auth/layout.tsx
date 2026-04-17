import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-sm font-semibold text-foreground">
          ← Back to Axis Housing
        </Link>
        <Link href="/rent/listings" className="text-sm font-semibold text-primary">
          View listings
        </Link>
      </div>
      <div className="mx-auto max-w-lg px-4 pb-16 pt-6">{children}</div>
    </div>
  );
}
