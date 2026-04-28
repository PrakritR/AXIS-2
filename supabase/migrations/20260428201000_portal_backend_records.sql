-- Backend-backed portal records for data that must not live only in browser storage.
-- Concrete APIs can read/write these tables while preserving flexible JSON row shapes.

create table if not exists public.portal_household_charge_records (
  id text primary key,
  manager_user_id uuid,
  resident_user_id uuid,
  resident_email text,
  property_id text,
  kind text,
  status text,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_household_charge_records_manager_idx
  on public.portal_household_charge_records (manager_user_id);

create index if not exists portal_household_charge_records_resident_email_idx
  on public.portal_household_charge_records (lower(resident_email));

create index if not exists portal_household_charge_records_property_idx
  on public.portal_household_charge_records (property_id);

create table if not exists public.portal_recurring_rent_profile_records (
  id text primary key,
  manager_user_id uuid,
  resident_user_id uuid,
  resident_email text,
  property_id text,
  active boolean not null default true,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_recurring_rent_profile_records_manager_idx
  on public.portal_recurring_rent_profile_records (manager_user_id);

create index if not exists portal_recurring_rent_profile_records_resident_email_idx
  on public.portal_recurring_rent_profile_records (lower(resident_email));

create table if not exists public.portal_inbox_thread_records (
  id text primary key,
  scope text not null,
  owner_user_id uuid,
  participant_email text,
  thread_type text,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_inbox_thread_records_scope_idx
  on public.portal_inbox_thread_records (scope, owner_user_id);

create index if not exists portal_inbox_thread_records_participant_email_idx
  on public.portal_inbox_thread_records (lower(participant_email));

create table if not exists public.portal_schedule_records (
  id text primary key,
  manager_user_id uuid,
  property_id text,
  record_type text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_schedule_records_manager_idx
  on public.portal_schedule_records (manager_user_id, record_type);

create index if not exists portal_schedule_records_property_idx
  on public.portal_schedule_records (property_id);

create table if not exists public.portal_lease_pipeline_records (
  id text primary key,
  manager_user_id uuid,
  resident_user_id uuid,
  resident_email text,
  property_id text,
  status text,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_lease_pipeline_records_manager_idx
  on public.portal_lease_pipeline_records (manager_user_id);

create index if not exists portal_lease_pipeline_records_resident_email_idx
  on public.portal_lease_pipeline_records (lower(resident_email));

create table if not exists public.portal_resident_lease_upload_records (
  id text primary key,
  resident_user_id uuid,
  resident_email text,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_resident_lease_upload_records_email_idx
  on public.portal_resident_lease_upload_records (lower(resident_email));

create table if not exists public.portal_pro_relationship_records (
  id text primary key,
  manager_user_id uuid,
  related_user_id uuid,
  related_email text,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_pro_relationship_records_manager_idx
  on public.portal_pro_relationship_records (manager_user_id);

create table if not exists public.portal_outbound_mail_records (
  id text primary key,
  recipient_email text,
  subject text,
  row_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists portal_outbound_mail_records_recipient_idx
  on public.portal_outbound_mail_records (lower(recipient_email));

create table if not exists public.site_content_records (
  id text primary key,
  page_key text not null,
  section_key text not null,
  content_key text not null,
  locale text not null default 'en',
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_content_records_page_section_idx
  on public.site_content_records (page_key, section_key, locale);

create table if not exists public.site_config_records (
  id text primary key,
  config_key text not null unique,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_preset_records (
  id text primary key,
  preset_group text not null,
  preset_key text not null,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (preset_group, preset_key)
);

create index if not exists site_preset_records_group_idx
  on public.site_preset_records (preset_group);

alter table public.portal_household_charge_records enable row level security;
alter table public.portal_recurring_rent_profile_records enable row level security;
alter table public.portal_inbox_thread_records enable row level security;
alter table public.portal_schedule_records enable row level security;
alter table public.portal_lease_pipeline_records enable row level security;
alter table public.portal_resident_lease_upload_records enable row level security;
alter table public.portal_pro_relationship_records enable row level security;
alter table public.portal_outbound_mail_records enable row level security;
alter table public.site_content_records enable row level security;
alter table public.site_config_records enable row level security;
alter table public.site_preset_records enable row level security;

insert into public.site_config_records (id, config_key, row_data, updated_at)
values
  (
    'manager-plan-tiers',
    'manager.plan.tiers',
    '{
      "tiers": [
        {
          "id": "free",
          "name": "Free",
          "priceMonthly": 0,
          "propertyLimit": 1,
          "features": ["Create one listing", "Receive applications", "Basic portal tools"]
        },
        {
          "id": "pro",
          "name": "Pro",
          "priceMonthly": 29,
          "propertyLimit": 3,
          "features": ["Up to three listings", "Applications and work orders", "Payment tracking"]
        },
        {
          "id": "business",
          "name": "Business",
          "priceMonthly": 99,
          "propertyLimit": 50,
          "features": ["Large portfolio support", "Owner/manager collaboration", "Advanced portal tools"]
        }
      ]
    }'::jsonb,
    now()
  ),
  (
    'rental-application-options',
    'rental.application.options',
    '{
      "leaseTerms": ["3-Month", "9-Month", "12-Month", "Month-to-Month", "Custom"],
      "tourTopics": [
        "General leasing question",
        "Availability & move-in dates",
        "Neighborhood & area",
        "Application process",
        "Pricing & fees",
        "Pet policy",
        "Other"
      ],
      "search": {
        "radiusMiles": [1, 3, 5, 10, 25],
        "bathroomOptions": ["any", "private", "shared"]
      }
    }'::jsonb,
    now()
  ),
  (
    'listing-form-presets',
    'listing.form.presets',
    '{
      "roomAvailability": ["Available now", "Available soon", "Unavailable"],
      "roomFurnishing": ["Unfurnished", "Furnished", "Bed, desk, and chair"],
      "amenityGroups": {
        "houseWide": ["WiFi", "In-unit laundry", "Air conditioning", "Near public transit", "Parking available"],
        "room": ["Desk", "Bed", "Heating", "AC", "Private bathroom"],
        "bathroom": ["Shower", "Toilet", "Bathtub"],
        "sharedSpace": ["Refrigerator", "Microwave", "Oven / range", "Dishwasher", "Living / lounge seating"]
      }
    }'::jsonb,
    now()
  )
on conflict (config_key) do update
set row_data = excluded.row_data, updated_at = now();

insert into public.site_content_records (id, page_key, section_key, content_key, row_data, updated_at)
values
  (
    'listing-default-house-rules',
    'rent.listing',
    'defaults',
    'houseRules',
    '{"text": "Shared housing. Keep common areas clean, respect quiet hours, and coordinate guests with housemates."}'::jsonb,
    now()
  ),
  (
    'listing-empty-state',
    'rent.tours',
    'empty',
    'noListings',
    '{"text": "No listed housing is available for tours right now."}'::jsonb,
    now()
  )
on conflict (id) do update
set row_data = excluded.row_data, updated_at = now();

-- Client access goes through service-role API routes so manager/admin/resident scoping
-- can be enforced consistently in application code.
