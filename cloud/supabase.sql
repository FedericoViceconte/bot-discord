-- Private encrypted state + one fenced lease. Run on a Supabase FREE project.
-- No Discord token, host access code, or plaintext SQLite data belongs here.
begin;
create schema if not exists wo_private;
revoke all on schema wo_private from public, anon, authenticated;

create table if not exists wo_private.cloud_rooms (
  id uuid primary key,
  client_id text not null check (client_id ~ '^[0-9]{17,20}$'),
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  access_hash text not null check (access_hash ~ '^[a-f0-9]{64}$'),
  holder uuid,
  epoch bigint not null default 0,
  lease_until timestamptz,
  revision bigint not null default 0,
  encrypted_state jsonb,
  updated_at timestamptz not null default clock_timestamp()
);
alter table wo_private.cloud_rooms enable row level security;
revoke all on wo_private.cloud_rooms from public, anon, authenticated;

create or replace function public.wo_cloud_call(
  p_room uuid, p_access text, p_action text, p_holder uuid default null,
  p_epoch bigint default 0, p_revision bigint default null, p_state jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  room wo_private.cloud_rooms%rowtype;
  instant timestamptz;
  result jsonb;
begin
  if p_access is null or length(p_access) <> 64 then
    raise exception 'WO_ACCESS_DENIED' using errcode = '42501';
  end if;
  select * into room from wo_private.cloud_rooms where id = p_room for update;
  if not found or room.access_hash <> pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_access, 'UTF8')), 'hex') then
    raise exception 'WO_ACCESS_DENIED' using errcode = '42501';
  end if;
  instant := pg_catalog.clock_timestamp();
  if p_action = 'peek' then
    return jsonb_build_object('initialized', room.encrypted_state is not null, 'clientId', room.client_id, 'guildId', room.guild_id);
  end if;
  if p_action in ('seed', 'save') then
    if p_state is null or jsonb_typeof(p_state) is distinct from 'object' or p_state->>'v' is distinct from '1'
      or jsonb_typeof(p_state->'ciphertext') is distinct from 'string'
      or length(p_state->>'iv') is distinct from 16 or length(p_state->>'tag') is distinct from 24
      or octet_length(p_state::text) > 16777216 then
      raise exception 'WO_INVALID_STATE';
    end if;
  end if;
  if p_action = 'seed' then
    if room.encrypted_state is not null or room.holder is not null then raise exception 'WO_ALREADY_INITIALIZED'; end if;
    update wo_private.cloud_rooms set encrypted_state = p_state, revision = 1, updated_at = instant where id = p_room;
    return jsonb_build_object('revision', 1);
  end if;
  if p_action = 'acquire' then
    if room.encrypted_state is null then raise exception 'WO_NOT_INITIALIZED'; end if;
    if p_holder is null then raise exception 'WO_INVALID_HOLDER'; end if;
    if room.holder is not null and room.holder <> p_holder and room.lease_until > instant then
      return jsonb_build_object('active', false, 'waitSeconds', greatest(1, ceil(extract(epoch from room.lease_until - instant))));
    end if;
    if room.holder is distinct from p_holder or room.lease_until is null or room.lease_until <= instant then
      room.epoch := room.epoch + 1;
    end if;
    update wo_private.cloud_rooms set holder = p_holder, epoch = room.epoch, lease_until = instant + interval '45 seconds' where id = p_room;
    return jsonb_build_object('active', true, 'epoch', room.epoch, 'revision', room.revision,
      'ttl', 45, 'state', room.encrypted_state, 'clientId', room.client_id, 'guildId', room.guild_id);
  end if;
  if p_action not in ('renew', 'save', 'release') then raise exception 'WO_INVALID_ACTION'; end if;
  if p_holder is null or room.holder is distinct from p_holder or room.epoch <> p_epoch or room.lease_until is null or room.lease_until <= instant then
    raise exception 'WO_LEASE_LOST' using errcode = '42501';
  end if;
  if p_action = 'release' then
    update wo_private.cloud_rooms set holder = null, lease_until = instant where id = p_room;
    return jsonb_build_object('released', true);
  end if;
  if p_action = 'save' then
    if p_revision is null or room.revision <> p_revision then raise exception 'WO_REVISION_CONFLICT'; end if;
    update wo_private.cloud_rooms set encrypted_state = p_state, revision = revision + 1,
      lease_until = instant + interval '45 seconds', updated_at = instant where id = p_room;
    return jsonb_build_object('revision', room.revision + 1, 'ttl', 45);
  end if;
  update wo_private.cloud_rooms set lease_until = instant + interval '45 seconds' where id = p_room;
  return jsonb_build_object('revision', room.revision, 'ttl', 45);
end;
$$;
revoke all on function public.wo_cloud_call(uuid,text,text,uuid,bigint,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.wo_cloud_call(uuid,text,text,uuid,bigint,bigint,jsonb) to anon;
commit;
