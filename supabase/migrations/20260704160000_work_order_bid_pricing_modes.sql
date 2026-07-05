-- Vendor portal: two pricing modes per quote (price the work order upfront, or
-- schedule a consultation visit first and price after) plus an equipment/materials
-- cost line split from labor. An "after_consultation" bid starts as a
-- scheduled-consultation placeholder (mode + consultation_visit_at set, no price
-- yet) and is filled in once the vendor submits pricing post-visit — so
-- amount_cents/proposed_time must become nullable.

alter table public.work_order_bids
  alter column amount_cents drop not null,
  alter column proposed_time drop not null;

alter table public.work_order_bids
  drop constraint if exists work_order_bids_amount_cents_check;
alter table public.work_order_bids
  add constraint work_order_bids_amount_cents_check check (amount_cents is null or amount_cents > 0);

alter table public.work_order_bids
  add column if not exists materials_cents integer not null default 0 check (materials_cents >= 0),
  add column if not exists quote_mode text not null default 'upfront' check (quote_mode in ('upfront', 'after_consultation')),
  add column if not exists consultation_visit_at timestamptz;
