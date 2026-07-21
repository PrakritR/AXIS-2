create unique index if not exists manager_bills_vendor_invoice_unique_idx
  on public.manager_bills (manager_user_id, vendor_invoice_id)
  where vendor_invoice_id is not null;
