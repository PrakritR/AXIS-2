import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="text-xs text-muted">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((c, idx) => (
          <li key={`${c.label}-${idx}`} className="flex items-center gap-2">
            {idx > 0 ? <span className="text-slate-300">/</span> : null}
            {c.href ? (
              <Link className="hover:text-foreground" href={c.href}>
                {c.label}
              </Link>
            ) : (
              <span className="font-semibold text-foreground">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
