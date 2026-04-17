import Link from "next/link";

export function PublicAnnouncement() {
  return (
    <div className="bg-announce text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-2 text-center text-xs font-semibold tracking-wide sm:flex-row sm:text-left">
        <p>SIGN UP NOW. NO APPLICATION FEE FOR A LIMITED TIME.</p>
        <Link
          href="/rent/apply"
          className="inline-flex items-center justify-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-600"
        >
          Apply now
        </Link>
      </div>
    </div>
  );
}
