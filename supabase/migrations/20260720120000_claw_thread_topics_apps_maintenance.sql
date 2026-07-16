-- Allow application + maintenance topics on Claw resident threads.

alter table public.claw_messaging_threads
  drop constraint if exists claw_messaging_threads_topic_check;

alter table public.claw_messaging_threads
  add constraint claw_messaging_threads_topic_check
  check (topic in (
    'payment',
    'lease',
    'leasing',
    'move_in',
    'general',
    'applications',
    'maintenance'
  ));
