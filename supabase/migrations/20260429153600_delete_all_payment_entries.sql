-- Clear all portal payment ledger entries.
-- Recurring rent profiles are cleared too because they regenerate rent charges.

delete from public.portal_household_charge_records;
delete from public.portal_recurring_rent_profile_records;
