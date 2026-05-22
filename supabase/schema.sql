-- noterooms schema
-- Run in Supabase SQL Editor

-- Rooms table
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null default '',
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists rooms_slug_idx on rooms(slug);
create index if not exists rooms_expires_idx on rooms(expires_at);

-- Messages table with room_id + reply support
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  reply_to uuid references messages(id) on delete set null,
  username text not null,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists messages_room_created_idx on messages(room_id, created_at);
create index if not exists messages_reply_to_idx on messages(reply_to);

-- Banned users
create table if not exists banned_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  reason text,
  created_at timestamptz default now()
);

-- App settings (lockdown per room or global)
create table if not exists app_settings (
  key text primary key,
  value text not null
);

-- RLS
alter table rooms enable row level security;
alter table messages enable row level security;
alter table banned_users enable row level security;
alter table app_settings enable row level security;

create policy "Public read rooms" on rooms for select using (true);
create policy "Public read messages" on messages for select using (true);
create policy "Public insert messages" on messages for insert with check (true);

-- Expired rooms auto-cleanup (optional cron)
-- delete from messages where room_id in (select id from rooms where expires_at < now());
-- delete from rooms where expires_at < now();
