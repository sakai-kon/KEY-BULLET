drop policy if exists "Clerk admins can update global game settings" on public.game_settings;
create policy "Clerk admins can update global game settings"
on public.game_settings for update
to authenticated
using (((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin' and id = 'global')
with check (((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin' and id = 'global');

drop policy if exists "Players can read active custom prompts" on public.game_custom_prompts;
create policy "Players can read active custom prompts"
on public.game_custom_prompts for select
to anon, authenticated
using (is_active = true or ((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin');

drop policy if exists "Clerk admins can create custom prompts" on public.game_custom_prompts;
create policy "Clerk admins can create custom prompts"
on public.game_custom_prompts for insert
to authenticated
with check (((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin');

drop policy if exists "Clerk admins can update custom prompts" on public.game_custom_prompts;
create policy "Clerk admins can update custom prompts"
on public.game_custom_prompts for update
to authenticated
using (((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin')
with check (((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin');

drop policy if exists "Clerk admins can delete custom prompts" on public.game_custom_prompts;
create policy "Clerk admins can delete custom prompts"
on public.game_custom_prompts for delete
to authenticated
using (((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin');

drop policy if exists "Clerk admins can monitor game rooms" on public.game_rooms;
drop policy if exists "Room members can read their rooms" on public.game_rooms;
create policy "Room members or Clerk admins can read their rooms"
on public.game_rooms for select
to authenticated
using (
  (select private.is_game_room_member(id))
  or ((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin'
);

drop policy if exists "Clerk admins can clean up inactive game rooms" on public.game_rooms;
create policy "Clerk admins can clean up inactive game rooms"
on public.game_rooms for delete
to authenticated
using (
  ((select auth.jwt()) -> 'metadata' ->> 'role') = 'admin'
  and status in ('waiting', 'finished')
);
