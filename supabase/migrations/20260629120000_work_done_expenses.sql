-- Work done expense categories and work-order expense linkage.

alter table public.manager_expense_entries
  add column if not exists source_work_order_id text;

create index if not exists manager_expense_entries_work_order_idx
  on public.manager_expense_entries (manager_user_id, source_work_order_id)
  where source_work_order_id is not null;

insert into public.chart_of_accounts (manager_user_id, code, name, account_type, is_system, sort_order)
values
  (null, 'mortgage', 'Mortgage', 'expense', true, 105),
  (null, 'property_tax', 'Property Tax', 'expense', true, 125),
  (null, 'cleaning', 'Cleaning', 'expense', true, 112),
  (null, 'plumbing', 'Plumbing', 'expense', true, 113),
  (null, 'mold_remediation', 'Mold Remediation', 'expense', true, 114),
  (null, 'materials', 'Materials / Equipment', 'expense', true, 116),
  (null, 'service_fees', 'Service Fees', 'expense', true, 155)
on conflict do nothing;
