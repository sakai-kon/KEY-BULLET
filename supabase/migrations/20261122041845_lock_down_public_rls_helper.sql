-- Prevent clients from invoking the SECURITY DEFINER event-trigger helper as an RPC.
-- The database event trigger remains enabled and continues enabling RLS on public tables.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
