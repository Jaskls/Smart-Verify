create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  student_no text unique,
  role text not null default 'student' check (role in ('student', 'admin')),
  school_email_verified boolean not null default false,
  pin_configured boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists school_email_verified boolean not null default false;
alter table public.profiles
  add column if not exists pin_configured boolean not null default false;
alter table public.profiles
  alter column student_no drop not null;

drop policy if exists "Users can read their own profile" on public.profiles;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'roster_verified'
  ) then
    execute '
      update public.profiles p
      set school_email_verified = p.roster_verified and exists (
        select 1 from auth.users u
        where u.id = p.id
          and u.email_confirmed_at is not null
          and lower(trim(u.email)) ~ ''^[^@]+@kld\.edu\.ph$''
      )
      where p.roster_verified
    ';
    alter table public.profiles drop column roster_verified;
  end if;
end;
$$;

create table if not exists public.student_roster (
  student_no text primary key check (student_no = trim(student_no) and student_no <> ''),
  school_email text not null check (school_email = trim(school_email) and school_email <> ''),
  full_name text not null check (full_name = trim(full_name) and full_name <> ''),
  claimed_by uuid unique references auth.users (id) on delete set null
);

create unique index if not exists student_roster_school_email_lower_key
  on public.student_roster (lower(trim(school_email)));

create table if not exists public.staff_admin_allowlist (
  email text not null check (email = trim(email) and email <> ''),
  claimed_by uuid unique references auth.users (id) on delete set null
);

create unique index if not exists staff_admin_allowlist_email_lower_key
  on public.staff_admin_allowlist (lower(trim(email)));

create table if not exists public.student_pin_credentials (
  student_no text primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.student_pin_credentials
  drop constraint if exists student_pin_credentials_student_no_fkey;
alter table public.student_pin_credentials
  drop constraint if exists student_pin_credentials_student_no_profile_fkey;
alter table public.student_pin_credentials
  add constraint student_pin_credentials_student_no_profile_fkey
  foreign key (student_no) references public.profiles(student_no) on delete cascade;

create table if not exists public.student_pin_rate_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0)
);

alter table public.profiles enable row level security;
revoke insert, update, delete on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select, update on public.profiles to service_role;

alter table public.student_roster enable row level security;
revoke all on public.student_roster from public, anon, authenticated;

alter table public.staff_admin_allowlist enable row level security;
revoke all on public.staff_admin_allowlist from public, anon, authenticated;

alter table public.student_pin_credentials enable row level security;
revoke all on public.student_pin_credentials from public, anon, authenticated;

alter table public.student_pin_rate_limits enable row level security;
revoke all on public.student_pin_rate_limits from public, anon, authenticated;
grant all on public.student_roster, public.student_pin_credentials,
  public.student_pin_rate_limits, public.staff_admin_allowlist to service_role;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (
    (select auth.uid()) = id
    and (
      role = 'admin'
      or (
        school_email_verified
        and pin_configured
        and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^@]+@kld\.edu\.ph$'
        and (
          coalesce((select auth.jwt() -> 'amr'), '[]'::jsonb)
            @> '[{"method":"magiclink"}]'::jsonb
          or coalesce((select auth.jwt() -> 'amr'), '[]'::jsonb)
            @> '[{"method":"otp"}]'::jsonb
        )
      )
    )
  );

create or replace function public.create_student_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_student_no text;
  student_full_name text;
  admin_full_name text;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new;
  end if;

  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  if lower(trim(coalesce(new.raw_user_meta_data ->> 'account_type', ''))) = 'admin'
    or exists (
      select 1 from public.staff_admin_allowlist
      where lower(trim(email)) = lower(trim(new.email))
    ) then
    update public.staff_admin_allowlist
    set claimed_by = new.id
    where lower(trim(email)) = lower(trim(new.email))
      and claimed_by is null;

    if not found then
      raise exception 'This email is not approved for an administrator account.';
    end if;

    admin_full_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
    if admin_full_name is null then
      admin_full_name := split_part(new.email, '@', 1);
    end if;

    insert into public.profiles (
      id, full_name, student_no, role, school_email_verified, pin_configured
    )
    values (
      new.id,
      admin_full_name,
      null,
      'admin',
      false,
      false
    );
    return new;
  end if;

  if new.email is null or lower(trim(new.email)) !~ '^[^@]+@kld\.edu\.ph$' then
    return new;
  end if;

  verified_student_no := nullif(trim(new.raw_user_meta_data ->> 'student_no'), '');
  if verified_student_no is null or length(verified_student_no) > 80 then
    return new;
  end if;

  student_full_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  if student_full_name is null then
    student_full_name := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (
    id, full_name, student_no, role, school_email_verified, pin_configured
  )
  values (
    new.id,
    student_full_name,
    verified_student_no,
    'student',
    true,
    false
  )
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.create_student_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists on_auth_user_verified_profile on auth.users;
create trigger on_auth_user_verified_profile
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.create_student_profile();

-- Restore confirmed self-registered students whose older profile was left
-- without a Student ID, then provision confirmed KLD accounts without profiles.
with student_candidates as (
  select
    p.id,
    nullif(trim(u.raw_user_meta_data ->> 'student_no'), '') as student_no,
    row_number() over (
      partition by nullif(trim(u.raw_user_meta_data ->> 'student_no'), '')
      order by p.created_at, p.id
    ) as candidate_number
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'student'
    and p.student_no is null
    and u.email_confirmed_at is not null
    and lower(trim(u.email)) ~ '^[^@]+@kld\.edu\.ph$'
    and nullif(trim(u.raw_user_meta_data ->> 'student_no'), '') is not null
    and length(trim(u.raw_user_meta_data ->> 'student_no')) <= 80
    and length(trim(u.raw_user_meta_data ->> 'student_no')) <= 80
)
update public.profiles p
set full_name = coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      p.full_name
    ),
    student_no = candidate.student_no,
    school_email_verified = true,
    pin_configured = exists (
      select 1
      from public.student_pin_credentials c
      where c.auth_user_id = p.id
        and c.student_no = candidate.student_no
    )
from auth.users u, student_candidates candidate
where p.id = u.id
  and candidate.id = p.id
  and candidate.candidate_number = 1
  and not exists (
    select 1
    from public.profiles existing
    where existing.student_no = candidate.student_no
      and existing.id <> p.id
  );

insert into public.profiles (
  id, full_name, student_no, role, school_email_verified, pin_configured
)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)),
  nullif(trim(u.raw_user_meta_data ->> 'student_no'), ''),
  'student',
  true,
  false
from auth.users u
where u.email_confirmed_at is not null
  and lower(trim(u.email)) ~ '^[^@]+@kld\.edu\.ph$'
  and coalesce(lower(trim(u.raw_user_meta_data ->> 'account_type')), '') <> 'admin'
  and nullif(trim(u.raw_user_meta_data ->> 'student_no'), '') is not null
  and length(trim(u.raw_user_meta_data ->> 'student_no')) <= 80
  and not exists (
    select 1 from public.staff_admin_allowlist s
    where lower(trim(s.email)) = lower(trim(u.email))
  )
  and not exists (
    select 1 from public.profiles p where p.id = u.id
  )
on conflict do nothing;

create or replace function public.consume_student_pin_login(
  p_ip_bucket text,
  p_student_bucket text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text;
  v_limit integer;
  v_count integer;
  v_allowed boolean := true;
begin
  if p_ip_bucket !~ '^[a-f0-9]{64}$'
    or p_student_bucket !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  if mod(extract(epoch from clock_timestamp())::bigint, 60) = 0 then
    delete from public.student_pin_rate_limits
    where window_started_at < now() - interval '1 day';
  end if;

  for v_bucket, v_limit in
    select buckets.bucket_hash, buckets.max_attempts
    from (values (p_ip_bucket, 30), (p_student_bucket, 5))
      as buckets(bucket_hash, max_attempts)
  loop
    insert into public.student_pin_rate_limits (
      bucket_hash, window_started_at, attempt_count
    )
    values (v_bucket, now(), 1)
    on conflict (bucket_hash) do update
    set window_started_at = case
          when public.student_pin_rate_limits.window_started_at < now() - interval '15 minutes'
            then now()
          else public.student_pin_rate_limits.window_started_at
        end,
        attempt_count = case
          when public.student_pin_rate_limits.window_started_at < now() - interval '15 minutes'
            then 1
          else least(public.student_pin_rate_limits.attempt_count + 1, 1000)
        end
    returning attempt_count into v_count;

    if v_count > v_limit then
      v_allowed := false;
    end if;
  end loop;

  return v_allowed;
end;
$$;
revoke all on function public.consume_student_pin_login(text, text) from public, anon, authenticated;
grant execute on function public.consume_student_pin_login(text, text) to service_role;

-- Provision approved administrator accounts that were email-confirmed before
-- their allowlist entry was added and this setup script was rerun.
update public.staff_admin_allowlist s
set claimed_by = u.id
from auth.users u
where lower(trim(s.email)) = lower(trim(u.email))
  and u.email_confirmed_at is not null
  and s.claimed_by is null
  and not exists (
    select 1 from public.profiles p where p.id = u.id
  );

insert into public.profiles (
  id, full_name, student_no, role, school_email_verified, pin_configured
)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)),
  null,
  'admin',
  false,
  false
from public.staff_admin_allowlist s
join auth.users u on u.id = s.claimed_by
where u.email_confirmed_at is not null
  and not exists (
    select 1 from public.profiles p where p.id = u.id
  );

-- student_roster is retained for legacy data only. New student registration
-- requires a confirmed KLD email and a unique self-entered Student ID.

-- Approve an administrator email before they create an account on the
-- Staff / Admin tab. They must confirm this exact email before an admin
-- profile is created. Do not add administrators to the student roster.
-- insert into public.staff_admin_allowlist (email)
-- values ('admin@your-school.edu');
