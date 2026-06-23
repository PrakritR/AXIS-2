/** Sidebar nav count pill — metallic (dark) / cobalt (light) per Blue Steel portal spec. */
export function PortalNavCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="min-w-[1.35rem] shrink-0 rounded-full px-1.5 py-px text-center text-[11px] font-bold tabular-nums leading-[1.35] bg-primary text-primary-foreground [html[data-theme=light]_&]:bg-primary [html[data-theme=light]_&]:text-white [html[data-theme=dark]_&]:bg-[linear-gradient(135deg,#ffffff,#bcd4ff)] [html[data-theme=dark]_&]:text-[#08142e]"
      aria-hidden
    >
      {label}
    </span>
  );
}
