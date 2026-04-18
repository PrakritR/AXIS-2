import Link from "next/link";

export function PublicAnnouncement() {
  return (
    <div
      className="border-b border-slate-200/70"
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 42%, #eef6ff 100%)",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-stretch justify-center gap-3 px-4 py-3 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-2.5 sm:text-left">
        <p className="max-w-2xl text-[11px] font-semibold uppercase leading-relaxed tracking-[0.12em] text-slate-500 sm:text-[11px]">
          Sign up now.{" "}
          <span className="font-bold text-slate-800">No application fee</span> for a limited time.
        </p>
        <Link
          href="/rent/apply"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center self-center rounded-full px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-[0_2px_12px_rgba(0,122,255,0.35)] transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_22px_-4px_rgba(0,122,255,0.5)] hover:brightness-[1.05] active:translate-y-px active:scale-[0.98] sm:min-h-0 sm:self-auto sm:px-4 sm:py-1.5 sm:text-[10px]"
          style={{ background: "linear-gradient(135deg, #007aff, #339cff)" }}
        >
          Apply now
        </Link>
      </div>
    </div>
  );
}
