-- KEY BULLET beta multiplayer rooms and private Realtime channels.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{6}$'),
  mode text not null check (mode in ('pvp', 'raid')),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  host_user_id text not null,
  max_players integer not null check (max_players in (2, 4)),
  created_at timestamptz not null default now()
);

create table if not exists public.game_room_members (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 20),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists game_room_members_user_idx
  on public.game_room_members(user_id, room_id);

alter table public.game_rooms enable row level security;
alter table public.game_room_members enable row level security;

revoke all privileges on public.game_rooms from anon, authenticated, public;
revoke all privileges on public.game_room_members from anon, authenticated, public;
grant select on public.game_rooms to authenticated;
grant select on public.game_room_members to authenticated;

create or replace function private.is_game_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt() ->> 'sub') is not null
    and exists (
      select 1
      from public.game_room_members m
      where m.room_id = p_room_id
        and m.user_id = (select auth.jwt() ->> 'sub')
    ),
    false
  );
$$;

revoke all on function private.is_game_room_member(uuid) from public, anon;
grant execute on function private.is_game_room_member(uuid) to authenticated;

create policy "Room members can read their rooms"
  on public.game_rooms
  for select
  to authenticated
  using ((select private.is_game_room_member(id)));

create policy "Room members can read their roster"
  on public.game_room_members
  for select
  to authenticated
  using ((select private.is_game_room_member(room_id)));

create or replace function private.require_game_user()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id text;
begin
  v_user_id := (select auth.jwt() ->> 'sub');
  if v_user_id is null or (select auth.jwt() ->> 'role') <> 'authenticated' then
    raise exception 'Authentication required';
  end if;
  return v_user_id;
end;
$$;

create or replace function private.create_game_room(p_mode text, p_display_name text)
returns table(room_id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_room_id uuid;
  v_code text;
  v_max_players integer;
begin
  v_user_id := private.require_game_user();
  if p_mode not in ('pvp', 'raid') then raise exception 'Invalid room mode'; end if;
  if char_length(trim(p_display_name)) < 1 or char_length(trim(p_display_name)) > 20 then
    raise exception 'Display name must be 1-20 characters';
  end if;
  v_max_players := case when p_mode = 'pvp' then 2 else 4 end;

  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 6));
    exit when not exists (select 1 from public.game_rooms r where r.code = v_code);
  end loop;

  insert into public.game_rooms(code, mode, host_user_id, max_players)
  values (v_code, p_mode, v_user_id, v_max_players)
  returning id into v_room_id;

  insert into public.game_room_members(room_id, user_id, display_name, is_ready)
  values (v_room_id, v_user_id, trim(p_display_name), true);

  return query select v_room_id, v_code;
end;
$$;

create or replace function private.join_game_room(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_room public.game_rooms%rowtype;
  v_member_count integer;
begin
  v_user_id := private.require_game_user();
  if char_length(trim(p_display_name)) < 1 or char_length(trim(p_display_name)) > 20 then
    raise exception 'Display name must be 1-20 characters';
  end if;

  select * into v_room
  from public.game_rooms
  where code = upper(trim(p_code)) and status = 'waiting'
  for update;

  if not found then raise exception 'Room not found or already started'; end if;

  if exists (
    select 1 from public.game_room_members m
    where m.room_id = v_room.id and m.user_id = v_user_id
  ) then
    update public.game_room_members
      set display_name = trim(p_display_name)
      where room_id = v_room.id and user_id = v_user_id;
    return v_room.id;
  end if;

  select count(*) into v_member_count
  from public.game_room_members m where m.room_id = v_room.id;

  if v_member_count >= v_room.max_players then raise exception 'Room is full'; end if;

  insert into public.game_room_members(room_id, user_id, display_name, is_ready)
  values (v_room.id, v_user_id, trim(p_display_name), false);

  return v_room.id;
end;
$$;

create or replace function private.set_game_room_ready(p_room_id uuid, p_ready boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
begin
  v_user_id := private.require_game_user();
  update public.game_room_members
    set is_ready = p_ready
    where room_id = p_room_id and user_id = v_user_id;
  if not found then raise exception 'You are not a member of this room'; end if;
end;
$$;

create or replace function private.start_game_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_room public.game_rooms%rowtype;
  v_count integer;
  v_ready_count integer;
begin
  v_user_id := private.require_game_user();
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if v_room.host_user_id <> v_user_id then raise exception 'Only the host can start the game'; end if;
  if v_room.status <> 'waiting' then raise exception 'Room has already started'; end if;

  select count(*), count(*) filter (where is_ready)
    into v_count, v_ready_count
    from public.game_room_members
    where room_id = p_room_id;

  if v_count < 2 then raise exception 'At least two players are required'; end if;
  if v_count <> v_ready_count then raise exception 'Everyone must be ready'; end if;

  update public.game_rooms set status = 'playing' where id = p_room_id;
end;
$$;

create or replace function private.leave_game_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_host_id text;
begin
  v_user_id := private.require_game_user();
  select host_user_id into v_host_id from public.game_rooms where id = p_room_id;
  if not found then return; end if;
  delete from public.game_room_members where room_id = p_room_id and user_id = v_user_id;
  if not found then raise exception 'You are not a member of this room'; end if;
  if v_host_id = v_user_id then
    delete from public.game_rooms where id = p_room_id;
  end if;
end;
$$;

revoke all on function private.require_game_user() from public, anon;
revoke all on function private.create_game_room(text, text) from public, anon;
revoke all on function private.join_game_room(text, text) from public, anon;
revoke all on function private.set_game_room_ready(uuid, boolean) from public, anon;
revoke all on function private.start_game_room(uuid) from public, anon;
revoke all on function private.leave_game_room(uuid) from public, anon;

grant execute on function private.require_game_user() to authenticated;
grant execute on function private.create_game_room(text, text) to authenticated;
grant execute on function private.join_game_room(text, text) to authenticated;
grant execute on function private.set_game_room_ready(uuid, boolean) to authenticated;
grant execute on function private.start_game_room(uuid) to authenticated;
grant execute on function private.leave_game_room(uuid) to authenticated;

create or replace function public.create_game_room(p_mode text, p_display_name text)
returns table(room_id uuid, room_code text)
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select * from private.create_game_room(p_mode, p_display_name); $$;

create or replace function public.join_game_room(p_code text, p_display_name text)
returns uuid
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select private.join_game_room(p_code, p_display_name); $$;

create or replace function public.set_game_room_ready(p_room_id uuid, p_ready boolean)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select private.set_game_room_ready(p_room_id, p_ready); $$;

create or replace function public.start_game_room(p_room_id uuid)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select private.start_game_room(p_room_id); $$;

create or replace function public.leave_game_room(p_room_id uuid)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select private.leave_game_room(p_room_id); $$;

revoke all on function public.create_game_room(text, text) from public, anon;
revoke all on function public.join_game_room(text, text) from public, anon;
revoke all on function public.set_game_room_ready(uuid, boolean) from public, anon;
revoke all on function public.start_game_room(uuid) from public, anon;
revoke all on function public.leave_game_room(uuid) from public, anon;

grant execute on function public.create_game_room(text, text) to authenticated;
grant execute on function public.join_game_room(text, text) to authenticated;
grant execute on function public.set_game_room_ready(uuid, boolean) to authenticated;
grant execute on function public.start_game_room(uuid) to authenticated;
grant execute on function public.leave_game_room(uuid) to authenticated;

create policy "Room members can receive private game broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    extension in ('broadcast', 'presence')
    and (select private.is_game_room_member(
      case
        when (select realtime.topic()) ~ '^keybullet-room:[0-9a-f-]{36}$'
        then split_part((select realtime.topic()), ':', 2)::uuid
        else null
      end
    ))
  );

create policy "Room members can send private game broadcasts"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and (select private.is_game_room_member(
      case
        when (select realtime.topic()) ~ '^keybullet-room:[0-9a-f-]{36}$'
        then split_part((select realtime.topic()), ':', 2)::uuid
        else null
      end
    ))
  );
