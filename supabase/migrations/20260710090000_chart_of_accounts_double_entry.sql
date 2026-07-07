-- Extend chart_of_accounts with real double-entry accounting fields and seed
-- asset/liability/equity accounts (Phase 0 of the financials buildout). This
-- table becomes the runtime source of truth for category/label/Schedule E
-- lookups (src/lib/reports/chart-of-accounts-store.ts); SYSTEM_CHART_ACCOUNTS
-- in src/lib/reports/categories.ts is now only a fallback for a failed read.

alter table public.chart_of_accounts
  drop constraint if exists chart_of_accounts_account_type_check;
alter table public.chart_of_accounts
  add constraint chart_of_accounts_account_type_check
  check (account_type in ('asset', 'liability', 'equity', 'income', 'expense'));

alter table public.chart_of_accounts
  add column if not exists account_number int,
  add column if not exists normal_balance text check (normal_balance in ('debit', 'credit')),
  -- Not a real FK: chart_of_accounts.code is only unique within a partial
  -- index (per system row, per manager override), and Postgres cannot target
  -- a partial unique index with a foreign key. Every parent_code seeded here
  -- is a system code (manager_user_id is null), so the intended integrity is
  -- upheld by seed data + app-level checks rather than a DB constraint.
  add column if not exists parent_code text,
  add column if not exists is_bank_account boolean not null default false,
  add column if not exists is_trust_account boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists schedule_e_line int,
  add column if not exists schedule_e_ref text,
  add column if not exists schedule_e_label text;

-- Backfill account_number / normal_balance / Schedule E fields for the
-- existing system income/expense rows (previously only defined in the TS
-- SYSTEM_CHART_ACCOUNTS constant).
update public.chart_of_accounts set account_number = 4000, normal_balance = 'credit', schedule_e_line = 3, schedule_e_ref = 'Sch. E, Line 3', schedule_e_label = 'Rents Received' where manager_user_id is null and code = 'rent_income';
update public.chart_of_accounts set account_number = 4010, normal_balance = 'credit', schedule_e_line = 3, schedule_e_ref = 'Sch. E, Line 3', schedule_e_label = 'Rents Received' where manager_user_id is null and code = 'late_fees';
update public.chart_of_accounts set account_number = 4020, normal_balance = 'credit', schedule_e_line = 3, schedule_e_ref = 'Sch. E, Line 3', schedule_e_label = 'Rents Received' where manager_user_id is null and code = 'pet_rent';
update public.chart_of_accounts set account_number = 4030, normal_balance = 'credit', schedule_e_line = 3, schedule_e_ref = 'Sch. E, Line 3', schedule_e_label = 'Rents Received' where manager_user_id is null and code = 'application_fee';
update public.chart_of_accounts set account_number = 4040, normal_balance = 'credit', schedule_e_line = 3, schedule_e_ref = 'Sch. E, Line 3', schedule_e_label = 'Rents Received' where manager_user_id is null and code = 'other_income';

update public.chart_of_accounts set account_number = 5000, normal_balance = 'debit', schedule_e_line = 14, schedule_e_ref = 'Sch. E, Line 14', schedule_e_label = 'Repairs' where manager_user_id is null and code = 'maintenance';
update public.chart_of_accounts set account_number = 5010, normal_balance = 'debit', schedule_e_line = 7, schedule_e_ref = 'Sch. E, Line 7', schedule_e_label = 'Cleaning and Maintenance' where manager_user_id is null and code = 'cleaning';
update public.chart_of_accounts set account_number = 5020, normal_balance = 'debit', schedule_e_line = 14, schedule_e_ref = 'Sch. E, Line 14', schedule_e_label = 'Repairs' where manager_user_id is null and code = 'plumbing';
update public.chart_of_accounts set account_number = 5030, normal_balance = 'debit', schedule_e_line = 14, schedule_e_ref = 'Sch. E, Line 14', schedule_e_label = 'Repairs' where manager_user_id is null and code = 'mold_remediation';
update public.chart_of_accounts set account_number = 5040, normal_balance = 'debit', schedule_e_line = 15, schedule_e_ref = 'Sch. E, Line 15', schedule_e_label = 'Supplies' where manager_user_id is null and code = 'materials';
update public.chart_of_accounts set account_number = 5050, normal_balance = 'debit', schedule_e_line = 12, schedule_e_ref = 'Sch. E, Line 12', schedule_e_label = 'Mortgage Interest' where manager_user_id is null and code = 'mortgage';
update public.chart_of_accounts set account_number = 5060, normal_balance = 'debit', schedule_e_line = 17, schedule_e_ref = 'Sch. E, Line 17', schedule_e_label = 'Utilities' where manager_user_id is null and code = 'utilities';
update public.chart_of_accounts set account_number = 5070, normal_balance = 'debit', schedule_e_line = 17, schedule_e_ref = 'Sch. E, Line 17', schedule_e_label = 'Utilities' where manager_user_id is null and code = 'electricity';
update public.chart_of_accounts set account_number = 5080, normal_balance = 'debit', schedule_e_line = 17, schedule_e_ref = 'Sch. E, Line 17', schedule_e_label = 'Utilities' where manager_user_id is null and code = 'heating';
update public.chart_of_accounts set account_number = 5090, normal_balance = 'debit', schedule_e_line = 17, schedule_e_ref = 'Sch. E, Line 17', schedule_e_label = 'Utilities' where manager_user_id is null and code = 'wifi';
update public.chart_of_accounts set account_number = 5100, normal_balance = 'debit', schedule_e_line = 16, schedule_e_ref = 'Sch. E, Line 16', schedule_e_label = 'Taxes' where manager_user_id is null and code = 'property_tax';
update public.chart_of_accounts set account_number = 5110, normal_balance = 'debit', schedule_e_line = 16, schedule_e_ref = 'Sch. E, Line 16', schedule_e_label = 'Taxes' where manager_user_id is null and code = 'taxes';
update public.chart_of_accounts set account_number = 5120, normal_balance = 'debit', schedule_e_line = 9, schedule_e_ref = 'Sch. E, Line 9', schedule_e_label = 'Insurance' where manager_user_id is null and code = 'insurance';
update public.chart_of_accounts set account_number = 5130, normal_balance = 'debit', schedule_e_line = 11, schedule_e_ref = 'Sch. E, Line 11', schedule_e_label = 'Management Fees' where manager_user_id is null and code = 'management';
update public.chart_of_accounts set account_number = 5140, normal_balance = 'debit', schedule_e_line = 10, schedule_e_ref = 'Sch. E, Line 10', schedule_e_label = 'Legal and Professional Fees' where manager_user_id is null and code = 'service_fees';
update public.chart_of_accounts set account_number = 5150, normal_balance = 'debit', schedule_e_line = 19, schedule_e_ref = 'Sch. E, Line 19', schedule_e_label = 'Other' where manager_user_id is null and code = 'other_expense';
update public.chart_of_accounts set account_number = 5160, normal_balance = 'debit', schedule_e_ref = 'Capitalize (Form 4562)', schedule_e_label = 'Capital Improvements' where manager_user_id is null and code = 'capital_improvement';

-- New system accounts: assets, liabilities, equity, and the nsf_fees income
-- code (mapping added in Phase 2/6, but the chart account exists from now).
insert into public.chart_of_accounts
  (manager_user_id, code, name, account_type, account_number, normal_balance, is_bank_account, is_trust_account, is_system, sort_order)
values
  (null, 'operating_cash', 'Operating Cash', 'asset', 1000, 'debit', true, false, true, 5),
  (null, 'trust_account_rental_ops', 'Trust Account — Rental Operations', 'asset', 1010, 'debit', true, true, true, 6),
  (null, 'trust_account_security_deposits', 'Trust Account — Security Deposits', 'asset', 1020, 'debit', true, true, true, 7),
  (null, 'accounts_receivable', 'Accounts Receivable', 'asset', 1100, 'debit', false, false, true, 8),
  (null, 'accounts_payable', 'Accounts Payable', 'liability', 2000, 'credit', false, false, true, 9),
  (null, 'security_deposit_liability', 'Security Deposits Held', 'liability', 2010, 'credit', false, false, true, 10),
  (null, 'owners_equity', 'Owner''s Equity', 'equity', 3000, 'credit', false, false, true, 11),
  (null, 'retained_earnings', 'Retained Earnings', 'equity', 3010, 'credit', false, false, true, 12)
on conflict do nothing;

insert into public.chart_of_accounts
  (manager_user_id, code, name, account_type, account_number, normal_balance, is_system, sort_order, schedule_e_line, schedule_e_ref, schedule_e_label)
values
  (null, 'nsf_fees', 'NSF Fees', 'income', 4050, 'credit', true, 45, 3, 'Sch. E, Line 3', 'Rents Received')
on conflict do nothing;
