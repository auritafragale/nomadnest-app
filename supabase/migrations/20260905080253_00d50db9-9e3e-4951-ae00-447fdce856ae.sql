-- Add evidence file paths to reports
alter table public.reports
  add column if not exists evidence_paths text[] default '{}';

-- Drop before recreate because the return type changed
drop function if exists public.admin_list_reports();

create or replace function public.admin_list_reports()
returns table (
  id uuid,
  reporter_user_id uuid,
  reporter_name text,
  reporter_email text,
  target_type report_target_type,
  target_id uuid,
  reason text,
  details text,
  status report_status,
  created_at timestamptz,
  updated_at timestamptz,
  target_name text,
  target_email text,
  target_profile_user_id uuid,
  evidence_paths text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.reporter_user_id,
         nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '') as reporter_name,
         p.email as reporter_email,
         r.target_type,
         r.target_id,
         r.reason,
         r.details,
         r.status,
         r.created_at,
         r.updated_at,
         coalesce(
           tp.full_name,
           nullif(trim(coalesce(tp.first_name,'') || ' ' || coalesce(tp.last_name,'')), ''),
           tp.email
         ) as target_name,
         tp.email as target_email,
         tp.id as target_profile_user_id,
         r.evidence_paths
  from public.reports r
  join public.profiles p on p.id = r.reporter_user_id
  left join public.profiles tp on tp.id = r.target_id
  where public.is_admin_user(auth.uid())
  order by r.created_at desc;
$$;

revoke all on function public.admin_list_reports() from public, anon;
grant execute on function public.admin_list_reports() to authenticated;

-- Storage rules for the private report-evidence bucket
-- A signed-in member may upload only into their own folder
drop policy if exists "Members upload their own report evidence" on storage.objects;
create policy "Members upload their own report evidence"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Only founders may view report evidence
drop policy if exists "Founders view report evidence" on storage.objects;
create policy "Founders view report evidence"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-evidence'
    and public.is_admin_user(auth.uid())
  );