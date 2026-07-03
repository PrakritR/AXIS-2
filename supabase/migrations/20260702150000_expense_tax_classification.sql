-- Taxable vs non-taxable (deductible vs non-deductible) classification for expenses.
-- Null means "derive from the category's rule-based default in code"; a stored
-- value is the auto-suggested label captured at creation time or a manager override.
alter table public.manager_expense_entries
  add column if not exists tax_deductible boolean;

-- Capital improvements must be capitalized/depreciated (Form 4562), not deducted
-- on Schedule E — the one system expense category that is non-deductible.
insert into public.chart_of_accounts (manager_user_id, code, name, account_type, is_system, sort_order)
values
  (null, 'capital_improvement', 'Capital Improvement', 'expense', true, 130)
on conflict do nothing;
