-- FriendChat schema. Run the ENTIRE file in Supabase Dashboard > SQL Editor.
-- This is a starter schema; test the policies with two separate accounts before launch.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 20),
  bio text not null default '' check (char_length(bio) <= 180),
  avatar_url text,
  banner_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  constraint no_self_friendship check (requester_id <> addressee_id),
  constraint unique_friend_request_direction unique (requester_id, addressee_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint no_self_message check (sender_id <> recipient_id)
);

create index if not exists messages_conversation_time_idx
  on public.messages (sender_id, recipient_id, created_at);
create index if not exists friendships_addressee_status_idx
  on public.friendships (addressee_id, status);

-- Create a profile whenever a new Auth user is created.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    'user_' || substr(new.id::text, 1, 8)
  );
  chosen_name := regexp_replace(chosen_name, '[^a-zA-Z0-9_]', '', 'g');
  if char_length(chosen_name) < 3 then
    chosen_name := 'user_' || substr(new.id::text, 1, 8);
  end if;

  -- If the requested username is already taken, create a unique fallback.
  if exists (select 1 from public.profiles p where lower(p.username) = lower(chosen_name)) then
    chosen_name := 'user_' || substr(new.id::text, 1, 8);
  end if;

  insert into public.profiles (id, username)
  values (new.id, chosen_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

-- RLS helper avoids recursive policy evaluation on friendships.
create or replace function public.are_friends(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = user_a and f.addressee_id = user_b)
        or (f.requester_id = user_b and f.addressee_id = user_a)
      )
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Only the recipient can accept/reject their incoming pending request.
create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.friendships
  set status = 'accepted'
  where id = request_id
    and addressee_id = auth.uid()
    and status = 'pending';
  if not found then
    raise exception 'Anfrage nicht gefunden oder nicht berechtigt.';
  end if;
end;
$$;

create or replace function public.reject_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.friendships
  set status = 'rejected'
  where id = request_id
    and addressee_id = auth.uid()
    and status = 'pending';
  if not found then
    raise exception 'Anfrage nicht gefunden oder nicht berechtigt.';
  end if;
end;
$$;

revoke all on function public.accept_friend_request(uuid) from public;
revoke all on function public.reject_friend_request(uuid) from public;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.reject_friend_request(uuid) to authenticated;

-- All exposed tables have RLS. Grants are explicitly limited.
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.friendships from anon, authenticated;
revoke all on public.messages from anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (id, username) on public.profiles to authenticated;
grant update (username, bio, avatar_url, banner_url, updated_at) on public.profiles to authenticated;

grant select, insert, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

drop policy if exists "Signed-in users can view profiles" on public.profiles;
create policy "Signed-in users can view profiles"
on public.profiles for select to authenticated using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists "Users can edit their own profile" on public.profiles;
create policy "Users can edit their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Users can see their friendship rows" on public.friendships;
create policy "Users can see their friendship rows"
on public.friendships for select to authenticated
using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists "Users can send a friend request" on public.friendships;
create policy "Users can send a friend request"
on public.friendships for insert to authenticated
with check (
  requester_id = (select auth.uid())
  and addressee_id <> (select auth.uid())
  and status = 'pending'
);

drop policy if exists "Participants can remove friendship rows" on public.friendships;
create policy "Participants can remove friendship rows"
on public.friendships for delete to authenticated
using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists "Friends can read their conversation" on public.messages;
create policy "Friends can read their conversation"
on public.messages for select to authenticated
using (
  (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  and public.are_friends(sender_id, recipient_id)
);

drop policy if exists "Friends can send messages to each other" on public.messages;
create policy "Friends can send messages to each other"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and recipient_id <> (select auth.uid())
  and public.are_friends(sender_id, recipient_id)
  and char_length(content) between 1 and 4000
);

drop policy if exists "Authors can edit their messages while still friends" on public.messages;
create policy "Authors can edit their messages while still friends"
on public.messages for update to authenticated
using (sender_id = (select auth.uid()) and public.are_friends(sender_id, recipient_id))
with check (
  sender_id = (select auth.uid())
  and public.are_friends(sender_id, recipient_id)
  and char_length(content) between 1 and 4000
);

drop policy if exists "Authors can delete their messages" on public.messages;
create policy "Authors can delete their messages"
on public.messages for delete to authenticated
using (sender_id = (select auth.uid()));

-- Public bucket means profile images can be displayed without a signed URL.
-- Upload/change/delete is restricted to the user's own folder: <auth.uid()>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', true, 4194304, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 4194304,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

drop policy if exists "Users upload profile media to own folder" on storage.objects;
create policy "Users upload profile media to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users update own profile media" on storage.objects;
create policy "Users update own profile media"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users delete own profile media" on storage.objects;
create policy "Users delete own profile media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Realtime subscription used by the client. If this says the table is already
-- in the publication, that is harmless; otherwise enable it in Database > Publications.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
