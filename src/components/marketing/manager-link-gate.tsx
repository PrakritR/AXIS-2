export function ManagerLinkGate({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Manager link required</p>
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
