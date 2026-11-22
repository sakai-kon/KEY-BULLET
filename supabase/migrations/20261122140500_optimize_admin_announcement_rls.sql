-- Optimize JWT claim lookups in announcement RLS policies.
drop policy if exists "Anyone can read published game announcements" on public.game_announcements;
drop policy if exists "Clerk admins can create game announcements" on public.game_announcements;
drop policy if exists "Clerk admins can update game announcements" on public.game_announcements;
drop policy if exists "Clerk admins can delete game announcements" on public.game_announcements;

create policy "Anyone can read published game announcements"
  on public.game_announcements
  for select
  to anon, authenticated
  using (
    is_published = true
    or (((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin')
  );

create policy "Clerk admins can create game announcements"
  on public.game_announcements
  for insert
  to authenticated
  with check (
    ((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin'
    and created_by = ((select auth.jwt()) ->> 'sub')
  );

create policy "Clerk admins can update game announcements"
  on public.game_announcements
  for update
  to authenticated
  using (
    ((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin'
  )
  with check (
    ((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin'
    and created_by = ((select auth.jwt()) ->> 'sub')
  );

create policy "Clerk admins can delete game announcements"
  on public.game_announcements
  for delete
  to authenticated
  using (
    ((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin'
  );
