-- Users (including anonymous guests) may edit only harmless profile fields from the browser.
-- `plan` and ids are written by the server (service role) only; before this, anyone could set plan = 'pro'.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, preferences, onboarding, updated_at) on public.profiles to authenticated;
