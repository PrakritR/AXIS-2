import Link from "next/link";

export function PublicAnnouncement() {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 px-4 py-2.5 text-center sm:flex-row sm:gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-800">
          Sign up now. No application fee for a limited time.
        </p>
        <Link
          href="/rent/apply"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#2563eb] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-600"
        >
          Apply now
        </Link>
      </div>
    </div>
  );
}
