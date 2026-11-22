-- Keep the existing save table and JSON payloads. Only the identity provider changes.
drop policy if exists "Users can read their own cloud save" on public.player_cloud_saves;
drop policy if exists "Users can insert their own cloud save" on public.player_cloud_saves;
drop policy if exists "Users can update their own cloud save" on public.player_cloud_saves;
drop policy if exists "Users can delete their own cloud save" on public.player_cloud_saves;

alter table public.player_cloud_saves
  drop constraint if exists player_cloud_saves_user_id_fkey;

alter table public.player_cloud_saves
  alter column user_id type text using user_id::text;

create policy "Clerk users can read their own cloud save"
on public.player_cloud_saves
for select
to authenticated
using (
  (select auth.jwt() ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and (select auth.jwt() ->> 'sub') = user_id
);

create policy "Clerk users can insert their own cloud save"
on public.player_cloud_saves
for insert
to authenticated
with check (
  (select auth.jwt() ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and (select auth.jwt() ->> 'sub') = user_id
);

create policy "Clerk users can update their own cloud save"
on public.player_cloud_saves
for update
to authenticated
using (
  (select auth.jwt() ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and (select auth.jwt() ->> 'sub') = user_id
)
with check (
  (select auth.jwt() ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and (select auth.jwt() ->> 'sub') = user_id
);

create policy "Clerk users can delete their own cloud save"
on public.player_cloud_saves
for delete
to authenticated
using (
  (select auth.jwt() ->> 'iss') = 'https://special-gannet-902.clerk.accounts.dev'
  and (select auth.jwt() ->> 'sub') = user_id
);

grant select, insert, update, delete on table public.player_cloud_saves to authenticated;
revoke all on table public.player_cloud_saves from anon;
