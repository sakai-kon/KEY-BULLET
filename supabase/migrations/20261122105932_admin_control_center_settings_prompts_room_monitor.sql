create table if not exists public.game_settings (
  id text primary key default 'global' check (id = 'global'),
  maintenance_mode boolean not null default false,
  maintenance_message text not null default 'ただいまメンテナンス中です。しばらくしてから再度アクセスしてください。',
  story_enabled boolean not null default true,
  endless_enabled boolean not null default true,
  online_enabled boolean not null default true,
  difficulty_override text not null default 'off' check (difficulty_override in ('off', 'normal', 'easy')),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_settings_message_length check (char_length(maintenance_message) between 1 and 500)
);

insert into public.game_settings (id)
values ('global')
on conflict (id) do nothing;

alter table public.game_settings enable row level security;

grant select on public.game_settings to anon, authenticated;
grant update on public.game_settings to authenticated;

drop policy if exists "Anyone can read global game settings" on public.game_settings;
create policy "Anyone can read global game settings"
on public.game_settings for select
to anon, authenticated
using (id = 'global');

drop policy if exists "Clerk admins can update global game settings" on public.game_settings;
create policy "Clerk admins can update global game settings"
on public.game_settings for update
to authenticated
using ((select auth.jwt() -> 'metadata' ->> 'role') = 'admin' and id = 'global')
with check ((select auth.jwt() -> 'metadata' ->> 'role') = 'admin' and id = 'global');

create table if not exists public.game_custom_prompts (
  id uuid primary key default gen_random_uuid(),
  genre text not null check (genre in ('anime', 'short', 'long')),
  title text not null check (char_length(title) between 1 and 60),
  display text not null check (char_length(display) between 1 and 500),
  note text not null default '管理者が追加したお題' check (char_length(note) between 1 and 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_custom_prompts enable row level security;

grant select on public.game_custom_prompts to anon, authenticated;
grant insert, update, delete on public.game_custom_prompts to authenticated;

drop policy if exists "Players can read active custom prompts" on public.game_custom_prompts;
create policy "Players can read active custom prompts"
on public.game_custom_prompts for select
to anon, authenticated
using (is_active = true or (select auth.jwt() -> 'metadata' ->> 'role') = 'admin');

drop policy if exists "Clerk admins can create custom prompts" on public.game_custom_prompts;
create policy "Clerk admins can create custom prompts"
on public.game_custom_prompts for insert
to authenticated
with check ((select auth.jwt() -> 'metadata' ->> 'role') = 'admin');

drop policy if exists "Clerk admins can update custom prompts" on public.game_custom_prompts;
create policy "Clerk admins can update custom prompts"
on public.game_custom_prompts for update
to authenticated
using ((select auth.jwt() -> 'metadata' ->> 'role') = 'admin')
with check ((select auth.jwt() -> 'metadata' ->> 'role') = 'admin');

drop policy if exists "Clerk admins can delete custom prompts" on public.game_custom_prompts;
create policy "Clerk admins can delete custom prompts"
on public.game_custom_prompts for delete
to authenticated
using ((select auth.jwt() -> 'metadata' ->> 'role') = 'admin');

drop policy if exists "Clerk admins can monitor game rooms" on public.game_rooms;
create policy "Clerk admins can monitor game rooms"
on public.game_rooms for select
to authenticated
using ((select auth.jwt() -> 'metadata' ->> 'role') = 'admin');

drop policy if exists "Clerk admins can clean up inactive game rooms" on public.game_rooms;
create policy "Clerk admins can clean up inactive game rooms"
on public.game_rooms for delete
to authenticated
using (
  (select auth.jwt() -> 'metadata' ->> 'role') = 'admin'
  and status in ('waiting', 'finished')
);
