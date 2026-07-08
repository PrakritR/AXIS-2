-- Fix sort_order collisions introduced/preexisting in the chart of accounts:
-- security_deposit_liability (new, Phase 0) collided with the preexisting
-- rent_income row at sort_order 10, and capital_improvement collided with
-- the preexisting taxes row at sort_order 130. getChartOfAccounts orders by
-- sort_order alone, so these need distinct values.

update public.chart_of_accounts
  set sort_order = 13
  where manager_user_id is null and code = 'security_deposit_liability';

update public.chart_of_accounts
  set sort_order = 135
  where manager_user_id is null and code = 'capital_improvement';
