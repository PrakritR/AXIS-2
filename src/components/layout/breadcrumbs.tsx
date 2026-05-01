import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="max-w-full overflow-x-auto text-xs text-muted [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ol className="flex w-max min-w-0 flex-nowrap items-center gap-2">
        {items.map((c, idx) => (
          <li key={`${c.label}-${idx}`} className="flex items-center gap-2">
            {idx > 0 ? <span className="text-slate-300">/</span> : null}
            {c.href ? (
              <Link className="whitespace-nowrap hover:text-foreground" href={c.href}>
                {c.label}
              </Link>
            ) : (
              <span className="whitespace-nowrap font-semibold text-foreground">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
