-- Split & Settle — lives in its own `split` schema inside the TagMyCredit-Demo project.
-- Access model: you can read and write a group only if you are a member (members.user_id = auth.uid()).
-- Joining and claiming go through SECURITY DEFINER functions that check invite tokens.
-- Money is integer paise. Rows are never hard-deleted by users; deletes are soft and logged.

create schema if not exists split;
grant usage on schema split to anon, authenticated, service_role;

create table if not exists split.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  emoji text not null default '🛺' check (char_length(emoji) <= 8),
  invite_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists split.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references split.groups(id) on delete cascade,
  user_id uuid,
  name text not null check (char_length(name) between 1 and 40),
  upi_id text check (upi_id is null or upi_id ~ '^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,64}$'),
  is_admin boolean not null default false,
  claim_token text unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now(),
  left_at timestamptz,
  unique (group_id, user_id)
);
create index if not exists members_user on split.members(user_id);

create table if not exists split.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references split.groups(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 80),
  amount bigint not null check (amount > 0 and amount <= 10000000000),
  paid_by uuid not null references split.members(id),
  split_kind text not null check (split_kind in ('equal','exact','shares','percent')),
  split_input jsonb not null default '{}'::jsonb,
  shares jsonb not null,           -- { member_id: paise }
  spent_on date not null default current_date,
  category text not null default 'other' check (char_length(category) <= 20),
  created_by uuid not null references split.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  source text not null default 'app' check (source in ('app','splitwise'))
);
create index if not exists expenses_group on split.expenses(group_id, spent_on desc);

create table if not exists split.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references split.groups(id) on delete cascade,
  from_member uuid not null references split.members(id),
  to_member uuid not null references split.members(id),
  amount bigint not null check (amount > 0 and amount <= 10000000000),
  method text not null default 'upi' check (method in ('upi','cash','other')),
  recorded_by uuid not null references split.members(id),
  paid_on date not null default current_date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_member <> to_member)
);
create index if not exists settlements_group on split.settlements(group_id);

create table if not exists split.activity (
  id bigint generated always as identity primary key,
  group_id uuid not null references split.groups(id) on delete cascade,
  actor uuid references split.members(id),
  kind text not null,
  subject uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_group on split.activity(group_id, id desc);

-- ---------- helpers ----------
create or replace function split.my_member(g uuid) returns uuid
language sql stable security definer set search_path = split as $$
  select id from split.members where group_id = g and user_id = auth.uid() and left_at is null limit 1
$$;
create or replace function split.is_member(g uuid) returns boolean
language sql stable security definer set search_path = split as $$
  select exists (select 1 from split.members where group_id = g and user_id = auth.uid() and left_at is null)
$$;
create or replace function split.is_admin(g uuid) returns boolean
language sql stable security definer set search_path = split as $$
  select exists (select 1 from split.members where group_id = g and user_id = auth.uid() and is_admin and left_at is null)
$$;

-- Shares must reference members of the group, be positive, and add up to the amount exactly.
create or replace function split.check_expense() returns trigger
language plpgsql security definer set search_path = split as $$
declare total bigint := 0; k text; v jsonb;
begin
  if not exists (select 1 from split.members where id = new.paid_by and group_id = new.group_id) then
    raise exception 'payer is not in this group';
  end if;
  for k, v in select * from jsonb_each(new.shares) loop
    if jsonb_typeof(v) <> 'number' or (v::text)::bigint <= 0 then raise exception 'shares must be positive paise'; end if;
    if not exists (select 1 from split.members where id = k::uuid and group_id = new.group_id) then raise exception 'share for someone outside the group'; end if;
    total := total + (v::text)::bigint;
  end loop;
  if total <> new.amount then raise exception 'shares (%) do not add up to the amount (%)', total, new.amount; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists expenses_check on split.expenses;
create trigger expenses_check before insert or update on split.expenses for each row execute function split.check_expense();

create or replace function split.check_settlement() returns trigger
language plpgsql security definer set search_path = split as $$
begin
  if (select count(*) from split.members where id in (new.from_member, new.to_member) and group_id = new.group_id) <> 2 then
    raise exception 'both people must be in this group';
  end if;
  return new;
end $$;
drop trigger if exists settlements_check on split.settlements;
create trigger settlements_check before insert or update on split.settlements for each row execute function split.check_settlement();

-- Activity log: every change to an expense or settlement, with who did it and before/after.
create or replace function split.log_change() returns trigger
language plpgsql security definer set search_path = split as $$
declare k text;
begin
  if tg_op = 'INSERT' and tg_table_name = 'expenses' then
    if (to_jsonb(new)->>'source') = 'splitwise' then return new; end if;
  end if;
  if tg_op = 'INSERT' then k := tg_table_name || '.added';
  elsif new.deleted_at is not null and old.deleted_at is null then k := tg_table_name || '.deleted';
  elsif new.deleted_at is null and old.deleted_at is not null then k := tg_table_name || '.restored';
  else k := tg_table_name || '.edited'; end if;
  insert into split.activity(group_id, actor, kind, subject, before, after)
  values (new.group_id, split.my_member(new.group_id), k, new.id,
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;
drop trigger if exists expenses_log on split.expenses;
create trigger expenses_log after insert or update on split.expenses for each row execute function split.log_change();
drop trigger if exists settlements_log on split.settlements;
create trigger settlements_log after insert or update on split.settlements for each row execute function split.log_change();

-- ---------- row-level security ----------
alter table split.groups enable row level security;
alter table split.members enable row level security;
alter table split.expenses enable row level security;
alter table split.settlements enable row level security;
alter table split.activity enable row level security;

drop policy if exists g_read on split.groups;
create policy g_read on split.groups for select to authenticated using (split.is_member(id));
drop policy if exists g_update on split.groups;
create policy g_update on split.groups for update to authenticated using (split.is_admin(id)) with check (split.is_admin(id));

drop policy if exists m_read on split.members;
create policy m_read on split.members for select to authenticated using (split.is_member(group_id));
-- You may edit your own name / UPI ID; admins may edit anyone's. (Columns are restricted by the grant below.)
drop policy if exists m_update on split.members;
create policy m_update on split.members for update to authenticated
  using (user_id = auth.uid() or split.is_admin(group_id)) with check (user_id = auth.uid() or split.is_admin(group_id));

drop policy if exists e_read on split.expenses;
create policy e_read on split.expenses for select to authenticated using (split.is_member(group_id));
drop policy if exists e_insert on split.expenses;
create policy e_insert on split.expenses for insert to authenticated
  with check (split.is_member(group_id) and created_by = split.my_member(group_id) and source = 'app');
drop policy if exists e_update on split.expenses;
create policy e_update on split.expenses for update to authenticated
  using (split.is_member(group_id) and (created_by = split.my_member(group_id) or split.is_admin(group_id)))
  with check (split.is_member(group_id));

drop policy if exists s_read on split.settlements;
create policy s_read on split.settlements for select to authenticated using (split.is_member(group_id));
drop policy if exists s_insert on split.settlements;
create policy s_insert on split.settlements for insert to authenticated
  with check (split.is_member(group_id) and recorded_by = split.my_member(group_id));
drop policy if exists s_update on split.settlements;
create policy s_update on split.settlements for update to authenticated
  using (split.is_member(group_id) and (recorded_by = split.my_member(group_id) or from_member = split.my_member(group_id) or to_member = split.my_member(group_id) or split.is_admin(group_id)))
  with check (split.is_member(group_id));

drop policy if exists a_read on split.activity;
create policy a_read on split.activity for select to authenticated using (split.is_member(group_id));

revoke all on all tables in schema split from anon, authenticated;
grant select on split.groups, split.members, split.expenses, split.settlements, split.activity to authenticated;
grant update (name, emoji, archived_at) on split.groups to authenticated;
grant update (name, upi_id) on split.members to authenticated;
grant insert (group_id, description, amount, paid_by, split_kind, split_input, shares, spent_on, category, created_by) on split.expenses to authenticated;
grant update (description, amount, paid_by, split_kind, split_input, shares, spent_on, category, deleted_at) on split.expenses to authenticated;
grant insert (group_id, from_member, to_member, amount, method, recorded_by, paid_on) on split.settlements to authenticated;
grant update (deleted_at) on split.settlements to authenticated;
-- claim tokens and invite tokens are only readable through functions:
revoke select on split.members from authenticated;
grant select (id, group_id, user_id, name, upi_id, is_admin, created_at, left_at) on split.members to authenticated;
revoke select on split.groups from authenticated;
grant select (id, name, emoji, created_by, created_at, archived_at) on split.groups to authenticated;

-- ---------- functions (the only way to create, join or claim) ----------
create or replace function split.create_group(p_name text, p_emoji text, p_my_name text, p_others text[])
returns uuid language plpgsql security definer set search_path = split as $$
declare g uuid; n text; recent int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select count(*) into recent from split.groups where created_by = auth.uid() and created_at > now() - interval '1 day';
  if recent >= 20 then raise exception 'too many groups today'; end if;
  if coalesce(array_length(p_others, 1), 0) > 30 then raise exception 'too many people'; end if;
  insert into split.groups(name, emoji) values (trim(p_name), coalesce(nullif(trim(p_emoji), ''), '🛺')) returning id into g;
  insert into split.members(group_id, user_id, name, is_admin, claim_token) values (g, auth.uid(), trim(p_my_name), true, null);
  foreach n in array coalesce(p_others, '{}') loop
    if char_length(trim(n)) > 0 then insert into split.members(group_id, name) values (g, trim(n)); end if;
  end loop;
  insert into split.activity(group_id, actor, kind, subject) values (g, split.my_member(g), 'group.created', g);
  return g;
end $$;

create or replace function split.add_member(p_group uuid, p_name text)
returns uuid language plpgsql security definer set search_path = split as $$
declare m uuid;
begin
  if not split.is_member(p_group) then raise exception 'not a member'; end if;
  if (select count(*) from split.members where group_id = p_group and left_at is null) >= 50 then raise exception 'group is full'; end if;
  insert into split.members(group_id, name) values (p_group, trim(p_name)) returning id into m;
  insert into split.activity(group_id, actor, kind, subject, after) values (p_group, split.my_member(p_group), 'member.added', m, jsonb_build_object('name', trim(p_name)));
  return m;
end $$;

-- What an invite link shows before joining: group name, people, and (for a personal link) who it's for.
create or replace function split.preview_invite(p_token text)
returns jsonb language plpgsql stable security definer set search_path = split as $$
declare g split.groups; m split.members;
begin
  select * into m from split.members where claim_token = p_token and user_id is null and left_at is null;
  if found then select * into g from split.groups where id = m.group_id;
  else select * into g from split.groups where invite_token = p_token and archived_at is null; end if;
  if g.id is null then return null; end if;
  return jsonb_build_object(
    'group_id', g.id, 'name', g.name, 'emoji', g.emoji,
    'for_member', case when m.id is not null then jsonb_build_object('id', m.id, 'name', m.name) end,
    'people', (select jsonb_agg(name order by created_at) from split.members where group_id = g.id and left_at is null),
    'already_member', split.is_member(g.id));
end $$;

-- Join with the group link (as a new person) or a personal link (as that placeholder).
create or replace function split.join_group(p_token text, p_name text)
returns uuid language plpgsql security definer set search_path = split as $$
declare g split.groups; m split.members; mine uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from split.members where claim_token = p_token and user_id is null and left_at is null for update;
  if found then
    if split.is_member(m.group_id) then return m.group_id; end if;
    update split.members set user_id = auth.uid(), claim_token = null, name = coalesce(nullif(trim(p_name), ''), name) where id = m.id;
    insert into split.activity(group_id, actor, kind, subject) values (m.group_id, m.id, 'member.joined', m.id);
    return m.group_id;
  end if;
  select * into g from split.groups where invite_token = p_token and archived_at is null;
  if g.id is null then raise exception 'this invite link is not valid any more'; end if;
  if split.is_member(g.id) then return g.id; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'enter your name'; end if;
  if (select count(*) from split.members where group_id = g.id and left_at is null) >= 50 then raise exception 'group is full'; end if;
  insert into split.members(group_id, user_id, name, claim_token) values (g.id, auth.uid(), trim(p_name), null) returning id into mine;
  insert into split.activity(group_id, actor, kind, subject) values (g.id, mine, 'member.joined', mine);
  return g.id;
end $$;

-- Invite links, for members of the group only.
create or replace function split.invite_links(p_group uuid)
returns jsonb language sql stable security definer set search_path = split as $$
  select case when split.is_member(p_group) then jsonb_build_object(
    'group', (select invite_token from split.groups where id = p_group),
    'people', coalesce((select jsonb_agg(jsonb_build_object('member_id', id, 'name', name, 'token', claim_token) order by created_at)
                        from split.members where group_id = p_group and user_id is null and left_at is null and claim_token is not null), '[]'::jsonb))
  end
$$;

-- Admin: new group link (old one stops working), or unlink a wrongly claimed person (gets a fresh personal link).
create or replace function split.rotate_invite(p_group uuid) returns void
language plpgsql security definer set search_path = split as $$
begin
  if not split.is_admin(p_group) then raise exception 'only the group admin can do this'; end if;
  update split.groups set invite_token = encode(extensions.gen_random_bytes(12), 'hex') where id = p_group;
end $$;
create or replace function split.unlink_member(p_member uuid) returns void
language plpgsql security definer set search_path = split as $$
declare m split.members;
begin
  select * into m from split.members where id = p_member;
  if not split.is_admin(m.group_id) or m.is_admin then raise exception 'not allowed'; end if;
  update split.members set user_id = null, claim_token = encode(extensions.gen_random_bytes(12), 'hex') where id = p_member;
  insert into split.activity(group_id, actor, kind, subject) values (m.group_id, split.my_member(m.group_id), 'member.unlinked', p_member);
end $$;

-- Splitwise import: creates a new group from a parsed export; the importer becomes admin.
create or replace function split.import_splitwise(p_name text, p_my_name text, p_people text[], p_rows jsonb)
returns uuid language plpgsql security definer set search_path = split as $$
declare g uuid; ids uuid[] := '{}'; mid uuid; r jsonb; me uuid; i int; payer uuid; shares jsonb; k text; v jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_array_length(p_rows) > 5000 or array_length(p_people, 1) > 50 then raise exception 'export too large'; end if;
  insert into split.groups(name, emoji) values (trim(p_name), '🧾') returning id into g;
  for i in 1 .. array_length(p_people, 1) loop
    if p_people[i] = p_my_name then
      insert into split.members(group_id, user_id, name, is_admin, claim_token) values (g, auth.uid(), p_people[i], true, null) returning id into mid;
    else
      insert into split.members(group_id, name) values (g, p_people[i]) returning id into mid;
    end if;
    ids := ids || mid;
  end loop;
  me := split.my_member(g);
  if me is null then raise exception 'pick which person in the export is you'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if r->>'kind' = 'payment' then
      insert into split.settlements(group_id, from_member, to_member, amount, method, recorded_by, paid_on)
      values (g, ids[(r->>'from')::int + 1], ids[(r->>'to')::int + 1], (r->>'amount')::bigint, 'other', me, (r->>'date')::date);
    else
      payer := ids[(r->>'payer')::int + 1];
      shares := '{}'::jsonb;
      for k, v in select * from jsonb_each(r->'shares') loop shares := shares || jsonb_build_object(ids[k::int + 1]::text, v); end loop;
      insert into split.expenses(group_id, description, amount, paid_by, split_kind, shares, spent_on, category, created_by, source)
      values (g, left(r->>'description', 80), (r->>'amount')::bigint, payer, 'exact', shares, (r->>'date')::date, 'splitwise', me, 'splitwise');
    end if;
  end loop;
  insert into split.activity(group_id, actor, kind, subject, after) values (g, me, 'group.imported', g, jsonb_build_object('rows', jsonb_array_length(p_rows)));
  return g;
end $$;

revoke all on all functions in schema split from public, anon;
grant execute on function split.create_group, split.add_member, split.preview_invite, split.join_group, split.invite_links,
  split.rotate_invite, split.unlink_member, split.import_splitwise, split.my_member, split.is_member, split.is_admin to authenticated;

-- realtime
do $$ begin
  begin alter publication supabase_realtime add table split.expenses, split.settlements, split.members, split.groups; exception when duplicate_object then null; end;
end $$;
