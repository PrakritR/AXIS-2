-- Repair rows mis-stamped by the FIRST version of the conversation-identity
-- backfill (20260721210000).
--
-- That version tested the Claw thread topic BEFORE the row's own account
-- linkage. Because `claw_messaging_threads` holds one mutable row per
-- (manager, phone) whose `topic` is overwritten on every thread touch, any
-- current resident whose latest Claw thread happened to be `leasing` had their
-- ENTIRE history re-stamped `counterparty_role = 'prospect'`. The read path
-- (`fetchManagerSmsConversations`) deliberately refuses to fold a prospect
-- thread into a directory resident's conversation, so the named resident's
-- thread rendered empty and disappeared from the list, while the history
-- resurfaced as an unnamed raw phone number with no resident email — invisible
-- on the resident detail page's SMS tab, with nothing in the UI disclosing the
-- loss.
--
-- 20260721210000 now orders linkage first, so a database that has NOT applied
-- it yet is already correct and this migration is a no-op there. Databases that
-- applied the earlier version keep the bad stamp (the backfill only touches
-- rows still marked 'unknown', so re-running it would not undo anything) — this
-- corrects them.
--
-- Safe to run repeatedly, and it cannot touch a genuine prospect thread: the
-- leasing responder logs prospect rows with NO resident account attached
-- (`persistClawInboundSms` passes no residentUserId on the leasing branch, and
-- a manager/admin reply into a prospect thread inherits that null), so
-- `prospect` + a non-null account id is only ever a backfill artifact.

update public.manager_sms_messages m
set counterparty_role = 'resident',
    conversation_key =
      coalesce(m.manager_user_id::text, '') || ':resident:' ||
      coalesce(nullif(m.resident_user_id::text, ''), public.axis_sms_phone_ref(m.resident_phone))
where m.counterparty_role = 'prospect'
  and m.resident_user_id is not null;

update public.inbound_sms_log l
set counterparty_role = 'resident',
    conversation_key =
      coalesce(l.manager_user_id::text, '') || ':resident:' ||
      coalesce(nullif(l.matched_sender_user_id::text, ''), public.axis_sms_phone_ref(l.from_phone))
where l.counterparty_role = 'prospect'
  and l.matched_sender_user_id is not null;
