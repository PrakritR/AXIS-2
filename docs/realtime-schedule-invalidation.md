# Future work: replace the calendar poll with Supabase Realtime

**Status:** proposed, not implemented. Documented so the upgrade path is ready
when it is worth doing.

## Why this exists

The portal calendar keeps schedule data fresh by polling
`/api/portal-schedule-records`. After the egress-reduction work (PR #20) the poll
is visibility-gated and runs every 60s, but it is still a timer: every open
calendar tab re-fetches on a schedule even when nothing changed. That is the
steadiest per-user PostgREST egress drain once the app has real usage.

Supabase Realtime can replace the timer with a push, so a client only does work
when a schedule row actually changes. Propagation also goes from "up to 60s" to
near-instant.

**When to do it:** when either (a) instant schedule propagation becomes a real
product requirement (live calendar collaboration), or (b) polling volume grows
enough that idle egress outweighs the added surface. At current scale the gated
60s poll is fine; this is not urgent.

## The approach: Realtime as an invalidation signal, not a data channel

`portal_schedule_records` has **RLS enabled with no policies**, so the browser
cannot read it directly today; all scoping lives in the service-role API routes,
and the calendar juggles admin / manager / partner views via `storageKey`. Using
Realtime **Postgres Changes** would force that app-layer scoping to be
re-implemented as RLS `SELECT` policies, duplicating logic we deliberately
centralized.

So instead: a database trigger broadcasts a tiny **"schedule changed" ping** (no
row data) to a per-manager topic. On receiving the ping, the client refetches
through the **existing** `/api/portal-schedule-records` route. Scoping stays in
app code, nothing sensitive crosses the socket, and the "facts are tool-grounded"
principle in `AGENTS.md` is preserved. Realtime only swaps the timer for an event.

This also means we do **not** add the table to the `supabase_realtime`
publication (that is only for Postgres Changes) and add **no** new npm deps
(`@supabase/ssr` is already installed).

## Implementation sketch

### 1. Migration (`supabase/migrations/<ts>_schedule_realtime_broadcast.sql`)

```sql
-- Broadcast a lightweight invalidation ping whenever a schedule row changes.
-- Payload carries NO row data; clients refetch through the scoped API route.
create or replace function public.broadcast_schedule_change()
returns trigger
language plpgsql
security definer
as $$
declare
  mgr uuid := coalesce(new.manager_user_id, old.manager_user_id);
begin
  if mgr is not null then
    perform realtime.send(
      jsonb_build_object('op', tg_op),   -- tiny; no sensitive fields
      'schedule_changed',                -- event name
      'schedule:' || mgr::text,          -- per-manager topic
      true                               -- private channel (needs authorization)
    );
  end if;
  return coalesce(new, old);
end;
$$;

create trigger portal_schedule_records_broadcast
  after insert or update or delete on public.portal_schedule_records
  for each row execute function public.broadcast_schedule_change();

-- Authorization: an authenticated user may only receive on their own topic.
-- (manager_user_id is the manager's auth uid, so this matches auth.uid().)
create policy "receive own schedule broadcast"
  on realtime.messages for select to authenticated
  using ( realtime.topic() = 'schedule:' || auth.uid()::text );
```

### 2. Client hook (`src/hooks/use-schedule-realtime-refresh.ts`)

```tsx
"use client";
import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// Server-pushed "schedule changed" pings for the current manager. Realtime is
// only a poke; the authoritative read still goes through the scoped route, so
// app-layer scoping is unchanged and no schedule data crosses the socket.
export function useScheduleRealtimeRefresh(onChange: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      await supabase.realtime.setAuth(); // attach JWT for the private channel
      channel = supabase
        .channel(`schedule:${user.id}`, { config: { private: true } })
        .on("broadcast", { event: "schedule_changed" }, () => onChange())
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, onChange]);
}
```

### 3. Replace the poll in `src/components/portal/portal-calendar-panels.tsx`

The 60s poll becomes an event subscription plus a much slower safety-net poll
(WebViews on iOS/Android can drop sockets on backgrounding, so keep a backstop):

```tsx
const refresh = useCallback(
  () => syncScheduleRecordsFromServer({ force: true }).then(() => setMeetingRefresh((n) => n + 1)),
  [],
);

useScheduleRealtimeRefresh(refresh, Boolean(storageKey));

// Safety net only (Realtime carries freshness): 60s -> 300s, still visibility-gated.
useEffect(() => {
  if (!storageKey) return;
  const id = setInterval(() => { if (!document.hidden) void refresh(); }, 300_000);
  const onVisible = () => { if (!document.hidden) void refresh(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
}, [storageKey, refresh]);
```

## Trade-offs and scope

- **Ops:** one migration, pushed to dev/test then production via the
  `npm run db:push` flow in [`database-environments.md`](database-environments.md).
  No publication change, no new deps.
- **Egress:** idle polling drops to near-zero; instead each schedule write emits
  ~1 tiny Realtime message per subscribed manager. Realtime bills on messages +
  peak connections (separate meter from egress), trivial at current volume.
- **Scope of the first cut:** a manager receiving pings for their **own**
  schedule. **Admin** ("sees all") and **co-manager** (linked accounts) views
  need extra topics: the trigger would `realtime.send()` to each linked manager's
  topic, and admin would subscribe to a shared `schedule:admin` topic with a
  matching authorization policy. Straightforward extension, real work.
- **Security:** the `security definer` trigger sends only the op type, never row
  data, so the socket exposes nothing; the scoped route remains the only path to
  actual schedule data.
- **Verification before shipping:** apply the migration to dev/test only, confirm
  a schedule change in one session refreshes another in near-real-time, confirm a
  second manager receives nothing for the first manager's topic, then push to
  production. Keep the safety-net poll so a dropped socket degrades to the current
  behavior rather than going stale.
