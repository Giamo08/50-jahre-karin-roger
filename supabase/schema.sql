create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_normalized text generated always as (lower(trim(username))) stored,
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now(),
  unique (username_normalized)
);

alter table public.users enable row level security;

grant select on public.users to anon;

create or replace function public.get_or_create_user(input_username text)
returns table (id uuid, username text, points integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := trim(input_username);
begin
  if clean_name is null or length(clean_name) < 1 or length(clean_name) > 30 then
    raise exception 'Ungültiger Benutzername';
  end if;

  insert into public.users (username)
  values (clean_name)
  on conflict (username_normalized) do nothing;

  return query
  select u.id, u.username, u.points
  from public.users u
  where u.username_normalized = lower(clean_name)
  limit 1;
end;
$$;

grant execute on function public.get_or_create_user(text) to anon;

create policy "leaderboard is publicly readable"
on public.users
for select
to anon
using (true);

revoke insert, update, delete on public.users from anon;
