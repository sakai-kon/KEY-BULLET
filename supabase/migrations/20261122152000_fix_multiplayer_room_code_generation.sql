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
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
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