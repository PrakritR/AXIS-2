-- Scope vendor W-9 rows per manager (fixes vendor_id-only primary key).
alter table public.vendor_tax_profiles drop constraint if exists vendor_tax_profiles_pkey;
alter table public.vendor_tax_profiles add primary key (manager_user_id, vendor_id);
