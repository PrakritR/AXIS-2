-- Security: vendor bid writes must go through the service-role API (which verifies
-- work-order access + biddingOpen). The previous FOR ALL policy let a vendor INSERT
-- bids on arbitrary work orders via a direct Supabase client.
drop policy if exists work_order_bids_vendor_owner on public.work_order_bids;
create policy work_order_bids_vendor_read on public.work_order_bids
  for select using (vendor_user_id = auth.uid());
