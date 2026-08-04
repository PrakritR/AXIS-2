-- Does the CALLING user have a password set?
--
-- An account created through Google or Apple sign-in has no password, so the portal's
-- "Login & security" panel must ask it to SET one rather than asking for a "current
-- password" that cannot exist.
--
-- Why a function rather than reading a column: `auth.users` is not exposed through
-- PostgREST, and the GoTrue admin API returns no password-related field at all (its user
-- payload is id/aud/role/email/…/identities and nothing more). The identity list is NOT a
-- usable substitute — a passwordless account can still carry an `email` identity, so
-- `identities`/`app_metadata.providers` says which providers are linked, never whether a
-- password exists. `auth.users.encrypted_password` is the only authoritative signal.
--
-- Disclosure is one boolean about the CALLER'S OWN row: the predicate is `auth.uid()`,
-- which the client cannot forge, so this cannot be used to probe another account. Nothing
-- derived from the hash is returned. `anon` gets no execute grant, so it is unavailable
-- without a session.
create or replace function public.current_user_has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(u.encrypted_password, '') <> ''
  from auth.users u
  where u.id = (select auth.uid())
$$;

revoke all on function public.current_user_has_password() from public;
revoke all on function public.current_user_has_password() from anon;
grant execute on function public.current_user_has_password() to authenticated;
