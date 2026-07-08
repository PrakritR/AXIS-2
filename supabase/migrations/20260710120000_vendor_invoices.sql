-- Financials Phase 4 — vendor portal invoicing.
--
-- Vendors submit invoices to the managers they work for. A manager reviews and
-- moves each invoice through submitted → approved / rejected → scheduled → paid.
-- Payouts (vendor_payouts) stay work-order-driven and separate; invoices are the
-- vendor-initiated billing channel that Phase 5's AP/Bills workflow consumes.
--
-- bill_id is intentionally NULLABLE with NO foreign key yet: Phase 5's
-- manager_bills table does not exist at this point in the sequence. Phase 5 adds
-- the FK (vendor_invoices.bill_id -> manager_bills.id) when that table lands, so
-- an approved invoice can link to the bill it becomes without any schema rework
-- here. Everything else about this table is designed for that future link.
create table if not exists public.vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  vendor_user_id uuid not null references auth.users (id) on delete cascade,
  -- manager_vendor_records.id (text) the vendor is billing under, denormalized so
  -- manager-side reads never need to join the directory row.
  vendor_id text not null,
  -- Optional link to the portal_work_order_records row this invoice bills for.
  work_order_id text,
  invoice_number text,
  -- [{ description, quantity, unitAmountCents, amountCents }]
  line_items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'scheduled', 'paid')),
  memo text,
  -- Manager's reason when approving/rejecting/scheduling.
  decision_note text,
  -- Phase 5 adds: references public.manager_bills (id). Nullable, no FK yet.
  bill_id uuid,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_invoices_vendor_user_id_idx on public.vendor_invoices (vendor_user_id);
create index if not exists vendor_invoices_manager_user_id_idx on public.vendor_invoices (manager_user_id);
create index if not exists vendor_invoices_status_idx on public.vendor_invoices (status);
create index if not exists vendor_invoices_bill_id_idx on public.vendor_invoices (bill_id);
create index if not exists vendor_invoices_work_order_idx on public.vendor_invoices (work_order_id);

alter table public.vendor_invoices enable row level security;

-- Defense-in-depth only — all real writes go through service-role API routes that
-- re-verify ownership. Mirrors the vendor_payouts / work_order_bids policy split:
-- the vendor owns their own rows, the manager gets read access to invoices billed
-- to them.
create policy vendor_invoices_vendor_owner on public.vendor_invoices
  for all using (vendor_user_id = auth.uid()) with check (vendor_user_id = auth.uid());
create policy vendor_invoices_manager_read on public.vendor_invoices
  for select using (manager_user_id = auth.uid());

-- Self-service W-9: distinguish a tax profile the vendor filled out themselves in
-- the vendor portal from one a manager entered on their behalf. (vendor_user_id was
-- added in 20260704120000_vendor_portal_foundation.sql.)
alter table public.vendor_tax_profiles
  add column if not exists submitted_by_vendor boolean not null default false;
