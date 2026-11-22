-- Harden KEY BULLET multiplayer room lifecycle and result recovery.
alter table public.game_rooms
  add column if not exists finish_reason text
    check (finish_reason in ('pvp-out', 'raid-clear')),
  add column if not exists result_user_id text,
  add column if not exists finished_at timestamptz;

create or replace function private.finish_game_room(
  p_room_id uuid,
  p_reason text,
  p_result_user_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_room public.game_rooms%rowtype;
begin
  v_user_id := private.require_game_user();

  select *
    into v_room
    from public.game_rooms
    where id = p_room_id
    for update;

  if not found then
    raise exception 'Room not found';
  end if;

  if not exists (
    select 1
      from public.game_room_members m
      where m.room_id = p_room_id
        and m.user_id = v_user_id
  ) then
    raise exception 'You are not a member of this room';
  end if;

  if v_room.status = 'finished' then
    if v_room.finish_reason is distinct from p_reason
      or v_room.result_user_id is distinct from p_result_user_id then
      raise exception 'Room already finished with a different result';
    end if;
    return;
  end if;

  if v_room.status <> 'playing' then
    raise exception 'Room is not playing';
  end if;

  if p_reason = 'pvp-out' then
    if v_room.mode <> 'pvp' or p_result_user_id is distinct from v_user_id then
      raise exception 'Only the defeated PVP player can report this result';
    end if;
    if not exists (
      select 1
        from public.game_room_members m
        where m.room_id = p_room_id
          and m.user_id = p_result_user_id
    ) then
      raise exception 'Result player is not a member of this room';
    end if;
  elsif p_reason = 'raid-clear' then
    if v_room.mode <> 'raid' or v_room.host_user_id <> v_user_id then
      raise exception 'Only the LINK RAID host can report a clear';
    end if;
    if p_result_user_id is not null and not exists (
      select 1
        from public.game_room_members m
        where m.room_id = p_room_id
          and m.user_id = p_result_user_id
    ) then
      raise exception 'Result player is not a member of this room';
    end if;
  else
    raise exception 'Invalid room finish reason';
  end if;

  update public.game_rooms
    set status = 'finished',
        finish_reason = p_reason,
        result_user_id = p_result_user_id,
        finished_at = now()
    where id = p_room_id;
end;
$$;

revoke all on function private.finish_game_room(uuid, text, text) from public, anon;
grant execute on function private.finish_game_room(uuid, text, text) to authenticated;

create or replace function public.finish_game_room(
  p_room_id uuid,
  p_reason text,
  p_result_user_id text default null
)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.finish_game_room(p_room_id, p_reason, p_result_user_id);
$$;

revoke all on function public.finish_game_room(uuid, text, text) from public, anon;
grant execute on function public.finish_game_room(uuid, text, text) to authenticated;
