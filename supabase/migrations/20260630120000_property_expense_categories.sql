-- Additional recurring property expense categories for documents / finances.

insert into public.chart_of_accounts (manager_user_id, code, name, account_type, is_system, sort_order)
values
  (null, 'electricity', 'Electricity', 'expense', true, 121),
  (null, 'heating', 'Heating / HVAC', 'expense', true, 122),
  (null, 'wifi', 'Wi‑Fi / Internet', 'expense', true, 123)
on conflict do nothing;
