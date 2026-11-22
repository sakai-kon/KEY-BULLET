-- Global announcements and maintenance notices managed by Clerk administrators.
-- Admin authority is stored in Clerk public metadata and copied into the session JWT as "metadata".

create table if not exists public.game_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) between 1 and 1000),
  kind text not null default 'info' check (kind in ('info', 'warning', 'maintenance')),
  is_published boolean not null default false,
  created_by text not null default (auth.jwt() ->> 'sub'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_announcements_published_created_idx
  on public.game_announcements (is_published, created_at desc);

alter table public.game_announcements enable row level security;

revoke all privileges on table public.game_announcements from anon, authenticated, public;
grant select on table public.game_announcements to anon, authenticated;
grant insert, update, delete on table public.game_announcements to authenticated;

drop policy if exists "Anyone can read published game announcements" on public.game_announcements;
create policy "Anyone can read published game announcements"
  on public.game_announcements
  for select
  to anon, authenticated
  using (
    is_published = true
    or (select auth.jwt() -> 'metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Clerk admins can create game announcements" on public.game_announcements;
create policy "Clerk admins can create game announcements"
  on public.game_announcements
  for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'metadata' ->> 'role') = 'admin'
    and created_by = (select auth.jwt() ->> 'sub')
  );

drop policy if exists "Clerk admins can update game announcements" on public.game_announcements;
create policy "Clerk admins can update game announcements"
  on public.game_announcements
  for update
  to authenticated
  using (
    (select auth.jwt() -> 'metadata' ->> 'role') = 'admin'
  )
  with check (
    (select auth.jwt() -> 'metadata' ->> 'role') = 'admin'
    and created_by = (select auth.jwt() ->> 'sub')
  );

drop policy if exists "Clerk admins can delete game announcements" on public.game_announcements;
create policy "Clerk admins can delete game announcements"
  on public.game_announcements
  for delete
  to authenticated
  using (
    (select auth.jwt() -> 'metadata' ->> 'role') = 'admin'
  );
