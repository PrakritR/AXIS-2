create unique index if not exists manager_bills_vendor_invoice_unique
  on public.manager_bills (vendor_invoice_id)
  where vendor_invoice_id is not null;
