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
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.reporter_user_id,
         nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
         p.email,
         r.target_type,
         r.target_id,
         r.reason,
         r.details,
         r.status,
         r.created_at,
         r.updated_at
  from public.reports r
  left join public.profiles p on p.id = r.reporter_user_id
  where public.is_admin_user(auth.uid())
  order by r.created_at desc
$$;

revoke all on function public.admin_list_reports() from public, anon;
grant execute on function public.admin_list_reports() to authenticated;

create or replace function public.admin_set_report_status(p_report_id uuid, p_status report_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Not authorised';
  end if;

  update public.reports
     set status = p_status,
         updated_at = now()
   where id = p_report_id;
end;
$$;

revoke all on function public.admin_set_report_status(uuid, report_status) from public, anon;
grant execute on function public.admin_set_report_status(uuid, report_status) to authenticated;