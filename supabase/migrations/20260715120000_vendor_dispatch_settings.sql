-- Per-manager AI vendor-dispatch settings (mode off|approve|auto, guardrails,
-- agent messaging opt-in). Same per-capability jsonb-column pattern as
-- document_auto_file; defaults keep the feature fully dark until a manager opts in.
alter table public.manager_automation_settings
  add column if not exists vendor_dispatch jsonb not null default '{}'::jsonb;
