-- Rebuild Clerk ownership policies using init-plan-friendly JWT accessors.
drop policy if exists "Clerk users can read their own cloud save" on public.player_cloud_saves;
drop policy if exists "Clerk users can insert their own cloud save" on public.player_cloud_saves;
drop policy if exists "Clerk users can update their own cloud save" on public.player_cloud_saves;
drop policy if exists "Clerk users can delete their own cloud save" on public.player_cloud_saves;

create policy "Clerk users can read their own cloud save"
on public.player_cloud_saves
for select
to authenticated
using (
  ((select auth.jwt()) ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and ((select auth.jwt()) ->> 'sub') = user_id
);

create policy "Clerk users can insert their own cloud save"
on public.player_cloud_saves
for insert
to authenticated
with check (
  ((select auth.jwt()) ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and ((select auth.jwt()) ->> 'sub') = user_id
);

create policy "Clerk users can update their own cloud save"
on public.player_cloud_saves
for update
to authenticated
using (
  ((select auth.jwt()) ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and ((select auth.jwt()) ->> 'sub') = user_id
)
with check (
  ((select auth.jwt()) ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and ((select auth.jwt()) ->> 'sub') = user_id
);

create policy "Clerk users can delete their own cloud save"
on public.player_cloud_saves
for delete
to authenticated
using (
  ((select auth.jwt()) ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and ((select auth.jwt()) ->> 'sub') = user_id
);
