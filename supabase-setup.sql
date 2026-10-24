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

create table if not exists public.equipment (
  id text primary key,
  tag text not null unique,
  name text not null,
  category text not null,
  location text not null default '',
  total integer not null check (total >= 0),
  available integer not null check (available >= 0 and available <= total),
  condition text not null default 'Good',
  components jsonb not null default '[]'::jsonb check (jsonb_typeof(components) = 'array'),
  photo_url text,
  created_at timestamptz not null default now()
);
alter table public.equipment add column if not exists photo_url text;

create table if not exists public.equipment_loans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  student_name_snapshot text not null,
  student_no_snapshot text not null,
  equipment_id text not null references public.equipment(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  borrowed_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz,
  checklist_out jsonb not null check (jsonb_typeof(checklist_out) = 'array'),
  checklist_in jsonb,
  missing jsonb,
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  check (checklist_in is null or jsonb_typeof(checklist_in) = 'array'),
  check (missing is null or jsonb_typeof(missing) = 'array')
);

create table if not exists public.equipment_loan_overrides (
  code text primary key,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create or replace function public.check_equipment_stock_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_quantity integer;
begin
  if tg_op = 'INSERT' and exists (
    select 1 from public.equipment existing where existing.id = new.id
  ) then
    return new;
  end if;

  select coalesce(sum(quantity), 0)::integer into v_open_quantity
  from public.equipment_loans
  where equipment_id = new.id and returned_at is null;
  if new.available + v_open_quantity > new.total then
    raise exception 'Total stock cannot be lower than available units plus open loans.';
  end if;
  return new;
end;
$$;
revoke all on function public.check_equipment_stock_capacity() from public, anon, authenticated;
drop trigger if exists equipment_stock_capacity_insert on public.equipment;
drop trigger if exists equipment_stock_capacity_update on public.equipment;
create trigger equipment_stock_capacity_insert
  before insert on public.equipment
  for each row execute function public.check_equipment_stock_capacity();
create trigger equipment_stock_capacity_update
  before update of total, available on public.equipment
  for each row execute function public.check_equipment_stock_capacity();

alter table public.equipment enable row level security;
revoke all on public.equipment from public, anon;
grant select on public.equipment to authenticated;
grant insert, update, delete on public.equipment to authenticated;
drop policy if exists "Authenticated users can read equipment" on public.equipment;
create policy "Authenticated users can read equipment"
  on public.equipment for select to authenticated using (true);
drop policy if exists "Admins manage equipment" on public.equipment;
create policy "Admins manage equipment"
  on public.equipment for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

alter table public.equipment_loans enable row level security;
revoke all on public.equipment_loans from public, anon;
grant select on public.equipment_loans to authenticated;
drop policy if exists "Students and admins read loans" on public.equipment_loans;
create policy "Students and admins read loans"
  on public.equipment_loans for select to authenticated
  using (
    student_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

create or replace function public.is_smart_verify_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;
revoke all on function public.is_smart_verify_admin() from public, anon;
grant execute on function public.is_smart_verify_admin() to authenticated, service_role;

create table if not exists public.qr_sticker_queue (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null check (code = trim(code) and code <> ''),
  label text not null check (label = trim(label) and label <> ''),
  equipment_id text references public.equipment(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.qr_sticker_queue enable row level security;
revoke all on public.qr_sticker_queue from public, anon;
grant select, insert, update, delete on public.qr_sticker_queue to authenticated;
drop policy if exists "Admins manage their own QR sticker queue" on public.qr_sticker_queue;
create policy "Admins manage their own QR sticker queue"
  on public.qr_sticker_queue for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_smart_verify_admin()))
  with check (user_id = (select auth.uid()) and (select public.is_smart_verify_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment-photos', 'equipment-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view equipment photos" on storage.objects;
create policy "Public can view equipment photos"
  on storage.objects for select to public
  using (bucket_id = 'equipment-photos');
drop policy if exists "Admins upload equipment photos" on storage.objects;
create policy "Admins upload equipment photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'equipment-photos' and (select public.is_smart_verify_admin()));
drop policy if exists "Admins update equipment photos" on storage.objects;
create policy "Admins update equipment photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'equipment-photos' and (select public.is_smart_verify_admin()))
  with check (bucket_id = 'equipment-photos' and (select public.is_smart_verify_admin()));
drop policy if exists "Admins delete equipment photos" on storage.objects;
create policy "Admins delete equipment photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'equipment-photos' and (select public.is_smart_verify_admin()));

alter table public.equipment_loan_overrides enable row level security;
revoke all on public.equipment_loan_overrides from public, anon, authenticated;
grant all on public.equipment_loan_overrides to service_role;

create or replace function public.create_equipment_loan_override()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := 'OVR-' || upper(replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.is_smart_verify_admin() then
    raise exception 'Administrator access is required.';
  end if;
  insert into public.equipment_loan_overrides (code, created_by)
  values (v_code, auth.uid());
  return v_code;
end;
$$;
revoke all on function public.create_equipment_loan_override() from public, anon;
grant execute on function public.create_equipment_loan_override() to authenticated;

drop policy if exists "Admins can read student profiles" on public.profiles;
create policy "Admins can read student profiles"
  on public.profiles for select to authenticated
  using (public.is_smart_verify_admin());

drop function if exists public.create_equipment_loan(uuid, text, integer, timestamptz, jsonb, text);
create or replace function public.create_equipment_loan(
  p_student_id uuid,
  p_equipment_id text,
  p_quantity integer,
  p_due_at timestamptz,
  p_checklist_out jsonb,
  p_notes text,
  p_override_code text default null
)
returns public.equipment_loans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := auth.uid();
  v_equipment public.equipment%rowtype;
  v_student public.profiles%rowtype;
  v_loan public.equipment_loans%rowtype;
  v_overdue boolean;
begin
  if not public.is_smart_verify_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if p_quantity is null or p_quantity < 1 or p_due_at is null or p_checklist_out is null
    or (p_due_at at time zone 'Asia/Manila')::date < (now() at time zone 'Asia/Manila')::date
    or jsonb_typeof(p_checklist_out) is distinct from 'array' then
    raise exception 'Invalid loan details.';
  end if;

  select * into v_student from public.profiles
  where id = p_student_id and role = 'student'
    and school_email_verified and pin_configured and student_no is not null;
  if not found then raise exception 'Verified student profile not found.'; end if;

  select exists (
    select 1 from public.equipment_loans
    where student_id = p_student_id
      and returned_at is null
      and (due_at at time zone 'Asia/Manila')::date < (now() at time zone 'Asia/Manila')::date
  ) into v_overdue;
  if v_overdue then
    if p_override_code is null then
      raise exception 'Student has overdue loans. A one-use supervisor code is required.';
    end if;
    update public.equipment_loan_overrides
    set used_at = now()
    where code = upper(trim(p_override_code))
      and created_by = v_staff_id
      and used_at is null;
    if not found then
      raise exception 'Supervisor code is invalid or already used.';
    end if;
  end if;

  select * into v_equipment from public.equipment where id = p_equipment_id for update;
  if not found then raise exception 'Equipment not found.'; end if;
  if p_quantity > v_equipment.available then raise exception 'Not enough equipment is available.'; end if;
  if p_checklist_out <> v_equipment.components then raise exception 'The component checklist does not match this equipment.'; end if;

  update public.equipment set available = available - p_quantity where id = p_equipment_id;
  insert into public.equipment_loans (
    student_id, student_name_snapshot, student_no_snapshot, equipment_id,
    quantity, due_at, checklist_out, notes, created_by
  ) values (
    p_student_id, v_student.full_name, v_student.student_no, p_equipment_id,
    p_quantity, p_due_at, p_checklist_out, coalesce(p_notes, ''), v_staff_id
  ) returning * into v_loan;
  return v_loan;
end;
$$;
revoke all on function public.create_equipment_loan(uuid, text, integer, timestamptz, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_equipment_loan(uuid, text, integer, timestamptz, jsonb, text, text) to authenticated;

create or replace function public.record_equipment_return(
  p_loan_id uuid,
  p_checklist_in jsonb,
  p_condition text,
  p_notes text
)
returns public.equipment_loans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := auth.uid();
  v_loan public.equipment_loans%rowtype;
  v_equipment public.equipment%rowtype;
  v_missing jsonb;
begin
  if not public.is_smart_verify_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if jsonb_typeof(p_checklist_in) <> 'array'
    or p_condition is null
    or p_condition not in ('Good', 'Fair', 'Needs repair') then
    raise exception 'Invalid return details.';
  end if;

  select * into v_loan from public.equipment_loans where id = p_loan_id and returned_at is null for update;
  if not found then raise exception 'Open loan not found.'; end if;
  select * into v_equipment from public.equipment where id = v_loan.equipment_id for update;

  select coalesce(jsonb_agg(part), '[]'::jsonb) into v_missing
  from jsonb_array_elements(v_loan.checklist_out) as out_parts(part)
  where not (p_checklist_in @> jsonb_build_array(part));
  if exists (
    select 1 from jsonb_array_elements(p_checklist_in) as returned_parts(part)
    where not (v_loan.checklist_out @> jsonb_build_array(part))
  ) then raise exception 'Return checklist contains an unknown component.'; end if;

  update public.equipment set condition = p_condition where id = v_equipment.id;
  update public.equipment_loans
  set checklist_in = p_checklist_in,
      missing = case when v_missing = '[]'::jsonb then null else v_missing end,
      returned_at = case when v_missing = '[]'::jsonb then now() else null end,
      notes = concat_ws(' · ', nullif(notes, ''), nullif(trim(p_notes), ''))
  where id = p_loan_id
  returning * into v_loan;

  if v_loan.returned_at is not null then
    update public.equipment set available = least(total, available + v_loan.quantity)
    where id = v_equipment.id;
  end if;
  return v_loan;
end;
$$;
revoke all on function public.record_equipment_return(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.record_equipment_return(uuid, jsonb, text, text) to authenticated;

insert into public.equipment (id, tag, name, category, location, total, available, condition, components)
values
  ('eq-01', 'SV-EQ-0001', 'Compound Microscope', 'Microscopes', 'Bio Lab · Cabinet A', 12, 12, 'Good', '["Microscope body", "10x eyepiece", "Objective lenses (4x/10x/40x)", "Dust cover", "Power cable"]'::jsonb),
  ('eq-02', 'SV-EQ-0002', 'Digital Multimeter', 'Electronics', 'Physics Lab · Drawer 3', 20, 20, 'Good', '["Multimeter unit", "Red test lead", "Black test lead", "9V battery", "Carry pouch"]'::jsonb),
  ('eq-03', 'SV-EQ-0003', 'Arduino Uno Starter Kit', 'Electronics', 'Robotics Room · Shelf 2', 15, 15, 'Good', '["Arduino Uno board", "USB cable", "Breadboard", "Jumper wire set", "Component box"]'::jsonb),
  ('eq-04', 'SV-EQ-0004', 'Vernier Caliper', 'Measurement', 'Physics Lab · Drawer 1', 25, 25, 'Good', '["Caliper", "Protective case"]'::jsonb),
  ('eq-05', 'SV-EQ-0005', 'Digital Weighing Scale', 'Measurement', 'Chem Lab · Bench 4', 6, 6, 'Good', '["Scale unit", "Draft shield", "Calibration weight", "Power adapter"]'::jsonb),
  ('eq-06', 'SV-EQ-0006', 'Beaker Set (250–1000 mL)', 'Glassware', 'Chem Lab · Cabinet C', 30, 30, 'Good', '["250 mL beaker", "500 mL beaker", "1000 mL beaker"]'::jsonb),
  ('eq-07', 'SV-EQ-0007', 'Laptop — Lab Issue', 'Computing', 'IT Office · Locker 1–10', 10, 10, 'Fair', '["Laptop", "Charger", "Laptop sleeve"]'::jsonb),
  ('eq-08', 'SV-EQ-0008', 'Portable Projector', 'Audio-Visual', 'AV Room · Rack 1', 4, 4, 'Good', '["Projector", "HDMI cable", "Power cable", "Remote control", "Carry bag"]'::jsonb),
  ('eq-09', 'SV-EQ-0009', 'Oscilloscope (2-Channel)', 'Electronics', 'Physics Lab · Bench 2', 5, 5, 'Needs repair', '["Oscilloscope", "Probe x2", "Power cable"]'::jsonb)
on conflict (id) do nothing;

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

drop function if exists public.consume_student_pin_login(text, text);
create or replace function public.consume_student_pin_login(
  p_ip_bucket text,
  p_student_bucket text,
  p_record_failure boolean
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
    or p_student_bucket !~ '^[a-f0-9]{64}$'
    or p_record_failure is null then
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
    if p_record_failure then
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
    else
      select attempt_count into v_count
      from public.student_pin_rate_limits
      where bucket_hash = v_bucket
        and window_started_at >= now() - interval '15 minutes';
      if coalesce(v_count, 0) >= v_limit then
        v_allowed := false;
      end if;
    end if;

    if not v_allowed then
      exit;
    end if;
  end loop;

  return v_allowed;
end;
$$;
revoke all on function public.consume_student_pin_login(text, text, boolean) from public, anon, authenticated;
grant execute on function public.consume_student_pin_login(text, text, boolean) to service_role;

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
