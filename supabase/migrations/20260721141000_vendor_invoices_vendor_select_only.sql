-- Security: vendor invoice writes must go through the service-role API (which
-- recomputes totals from line items and enforces the submitted → approved/rejected
-- → scheduled → paid status flow). The previous FOR ALL policy let a vendor UPDATE
-- their own invoice rows directly via a public Supabase client — flipping status,
-- inflating total_cents after approval, or repointing manager_user_id/bill_id.
-- Mirrors 20260705120000_work_order_bids_vendor_select_only.sql: vendor is
-- SELECT-only, matching work_order_bids_vendor_read / vendor_payouts.
drop policy if exists vendor_invoices_vendor_owner on public.vendor_invoices;
drop policy if exists vendor_invoices_vendor_read on public.vendor_invoices;
create policy vendor_invoices_vendor_read on public.vendor_invoices
  for select using (vendor_user_id = auth.uid());
