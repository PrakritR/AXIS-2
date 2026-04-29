create index if not exists manager_purchases_user_id_idx
  on public.manager_purchases (user_id);

create index if not exists manager_purchases_manager_id_idx
  on public.manager_purchases (manager_id);

create index if not exists profile_roles_user_id_role_idx
  on public.profile_roles (user_id, role);

create index if not exists manager_application_records_manager_user_updated_idx
  on public.manager_application_records (manager_user_id, updated_at desc);

create index if not exists manager_application_records_resident_email_updated_idx
  on public.manager_application_records (resident_email, updated_at desc);

create index if not exists manager_application_records_property_updated_idx
  on public.manager_application_records (property_id, updated_at desc);

create index if not exists manager_application_records_assigned_property_updated_idx
  on public.manager_application_records (assigned_property_id, updated_at desc);

create index if not exists portal_household_charge_records_manager_updated_idx
  on public.portal_household_charge_records (manager_user_id, updated_at desc);

create index if not exists portal_household_charge_records_resident_user_updated_idx
  on public.portal_household_charge_records (resident_user_id, updated_at desc);

create index if not exists portal_household_charge_records_resident_email_updated_idx
  on public.portal_household_charge_records (resident_email, updated_at desc);

create index if not exists portal_household_charge_records_property_updated_idx
  on public.portal_household_charge_records (property_id, updated_at desc);

create index if not exists portal_recurring_rent_profiles_manager_updated_idx
  on public.portal_recurring_rent_profile_records (manager_user_id, updated_at desc);

create index if not exists portal_recurring_rent_profiles_resident_user_updated_idx
  on public.portal_recurring_rent_profile_records (resident_user_id, updated_at desc);

create index if not exists portal_recurring_rent_profiles_resident_email_updated_idx
  on public.portal_recurring_rent_profile_records (resident_email, updated_at desc);

create index if not exists portal_work_order_records_manager_updated_idx
  on public.portal_work_order_records (manager_user_id, updated_at desc);

create index if not exists portal_work_order_records_resident_email_updated_idx
  on public.portal_work_order_records (resident_email, updated_at desc);

create index if not exists portal_work_order_records_property_updated_idx
  on public.portal_work_order_records (property_id, updated_at desc);

create index if not exists portal_work_order_records_assigned_property_updated_idx
  on public.portal_work_order_records (assigned_property_id, updated_at desc);

create index if not exists portal_lease_pipeline_records_manager_updated_idx
  on public.portal_lease_pipeline_records (manager_user_id, updated_at desc);

create index if not exists portal_lease_pipeline_records_resident_user_updated_idx
  on public.portal_lease_pipeline_records (resident_user_id, updated_at desc);

create index if not exists portal_lease_pipeline_records_resident_email_updated_idx
  on public.portal_lease_pipeline_records (resident_email, updated_at desc);

create index if not exists portal_lease_pipeline_records_property_updated_idx
  on public.portal_lease_pipeline_records (property_id, updated_at desc);

create index if not exists portal_inbox_thread_records_owner_updated_idx
  on public.portal_inbox_thread_records (owner_user_id, updated_at desc);

create index if not exists portal_inbox_thread_records_participant_updated_idx
  on public.portal_inbox_thread_records (participant_email, updated_at desc);
