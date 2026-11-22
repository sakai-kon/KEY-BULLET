-- KEY BULLET cloud saves.
-- Each authenticated player can access only the row whose user_id matches auth.uid().

create table if not exists public.player_cloud_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stats jsonb not null default '{
    "version": 1,
    "totalRuns": 0,
    "storyClears": 0,
    "endlessBestWave": 0,
    "totalScore": 0,
    "totalGrazes": 0,
    "bestAccuracy": 0,
    "lastPlayedAt": null
  }'::jsonb,
  endless jsonb,
  updated_at timestamptz not null default now(),
  constraint player_cloud_saves_stats_object check (jsonb_typeof(stats) = 'object'),
  constraint player_cloud_saves_endless_object check (endless is null or jsonb_typeof(endless) = 'object')
);

alter table public.player_cloud_saves enable row level security;

revoke all privileges on table public.player_cloud_saves from anon, public;
grant select, insert, update, delete on table public.player_cloud_saves to authenticated;

drop policy if exists "Users can read their own cloud save" on public.player_cloud_saves;
create policy "Users can read their own cloud save"
  on public.player_cloud_saves
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own cloud save" on public.player_cloud_saves;
create policy "Users can insert their own cloud save"
  on public.player_cloud_saves
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own cloud save" on public.player_cloud_saves;
create policy "Users can update their own cloud save"
  on public.player_cloud_saves
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own cloud save" on public.player_cloud_saves;
create policy "Users can delete their own cloud save"
  on public.player_cloud_saves
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
