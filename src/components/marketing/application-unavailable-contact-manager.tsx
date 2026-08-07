function formatContactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function ApplicationUnavailableContactManager({
  propertyTitle,
  managerEmail,
  managerPhone,
}: {
  propertyTitle?: string;
  managerEmail?: string;
  managerPhone?: string;
}) {
  const email = managerEmail?.trim();
  const phone = managerPhone?.trim();
  const propertyLabel = propertyTitle?.trim();

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Applications unavailable</p>
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">No application available</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {propertyLabel
          ? `Online applications are not open for ${propertyLabel}.`
          : "Online applications are not open for this property."}{" "}
        Please message the property manager to apply.
      </p>
      {email || phone ? (
        <dl className="mt-6 space-y-3 text-left text-sm">
          {email ? (
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Manager email</dt>
              <dd className="mt-1 font-medium text-foreground">
                <a href={`mailto:${email}`} className="text-primary underline-offset-2 hover:underline">
                  {email}
                </a>
              </dd>
            </div>
          ) : null}
          {phone ? (
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Manager phone</dt>
              <dd className="mt-1 font-medium text-foreground">
                <a href={`tel:${phone}`} className="text-primary underline-offset-2 hover:underline">
                  {formatContactPhone(phone)}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted">Ask your property manager for their contact details.</p>
      )}
    </div>
  );
}
