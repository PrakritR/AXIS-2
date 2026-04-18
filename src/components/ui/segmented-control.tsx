"use client";

type SegmentedTwoProps<T extends string> = {
  value: T;
  onChange: (id: T) => void;
  left: { id: T; label: string };
  right: { id: T; label: string };
  className?: string;
};

/**
 * Two equal segments with a sliding pill — smooth, restrained motion.
 */
type SegmentedThreeProps<T extends string> = {
  value: T;
  onChange: (id: T) => void;
  first: { id: T; label: string };
  second: { id: T; label: string };
  third: { id: T; label: string };
  className?: string;
};

/** Three equal segments (Day / Week / Month style). */
export function SegmentedThree<T extends string>({
  value,
  onChange,
  first,
  second,
  third,
  className = "",
}: SegmentedThreeProps<T>) {
  const opts = [first, second, third];
  return (
    <div
      className={`grid grid-cols-3 gap-1 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-1 shadow-sm backdrop-blur-sm ${className}`}
    >
      {opts.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
              active
                ? "bg-gradient-to-br from-[#007aff] to-[#339cff] text-white shadow-[0_4px_14px_-4px_rgba(0,122,255,0.45)]"
                : "text-slate-500 hover:bg-white/60 hover:text-slate-800"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedTwo<T extends string>({ value, onChange, left, right, className = "" }: SegmentedTwoProps<T>) {
  const isRight = value === right.id;

  return (
    <div className={`relative flex gap-1 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-1 shadow-sm backdrop-blur-sm ${className}`}>
      <span
        aria-hidden
        className="segmented-pill absolute bottom-1 left-1 top-1 w-[calc(50%-6px)] rounded-xl bg-gradient-to-br from-[#007aff] to-[#339cff] shadow-[0_4px_14px_-4px_rgba(0,122,255,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
        style={{ transform: isRight ? "translateX(calc(100% + 0.25rem))" : "translateX(0)" }}
      />
      <button
        type="button"
        onClick={() => onChange(left.id)}
        className={`relative z-10 flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors duration-300 ${
          value === left.id ? "text-white" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        {left.label}
      </button>
      <button
        type="button"
        onClick={() => onChange(right.id)}
        className={`relative z-10 flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors duration-300 ${
          value === right.id ? "text-white" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        {right.label}
      </button>
    </div>
  );
}
