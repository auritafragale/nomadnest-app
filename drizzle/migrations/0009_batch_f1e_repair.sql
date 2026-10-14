-- Batch F1e: one-time repair of sits moved to new dates before F1e.
-- Apply ONLY after 20261014220000_batch_f1e.sql, and only once its preview
-- (supabase/checks/batch_f1e_repair_preview.sql) has been reviewed on live.
--
-- For every sit (confirmed, in progress or completed) whose range has no
-- accepted application from its Nomad, while exactly one accepted application
-- from that Nomad sits on another range of the same listing with no sit of
-- theirs: move that application to the sit's range, move the Nomad's
-- "applied" invitation(s) on the old range with it, and close the old range
-- (deleted if nothing else refers to it). Sits with more than one candidate
-- are left alone and reported. No status changes, so no alerts are sent.

DO $repair$
DECLARE
  r record;
  v_moved integer := 0;
  v_skipped integer := 0;
BEGIN
  FOR r IN
    WITH s AS (
      SELECT si.id AS sit_id, si.listing_id, si.sitter_user_id, si.sit_dates_id
      FROM public.sits si
      WHERE si.sit_dates_id IS NOT NULL
        AND si.status IN ('confirmed', 'in_progress', 'completed')
        AND NOT EXISTS (SELECT 1 FROM public.applications a
                        WHERE a.sit_dates_id = si.sit_dates_id AND a.sitter_user_id = si.sitter_user_id AND a.status = 'accepted')
    )
    SELECT s.sit_id, s.sitter_user_id, s.sit_dates_id,
           a.id AS app_id, a.sit_dates_id AS old_range,
           count(*) OVER (PARTITION BY s.sit_id) AS candidates
    FROM s
    JOIN public.applications a
      ON a.listing_id = s.listing_id AND a.sitter_user_id = s.sitter_user_id AND a.status = 'accepted'
     AND a.sit_dates_id <> s.sit_dates_id
    WHERE NOT EXISTS (SELECT 1 FROM public.sits z
                      WHERE z.sit_dates_id = a.sit_dates_id AND z.sitter_user_id = a.sitter_user_id
                        AND z.status IN ('confirmed', 'in_progress', 'completed'))
  LOOP
    IF r.candidates <> 1 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    UPDATE public.applications SET sit_dates_id = r.sit_dates_id WHERE id = r.app_id;

    PERFORM set_config('app.trusted_invite_move', 'on', true);
    UPDATE public.sitter_invites SET sit_dates_id = r.sit_dates_id
    WHERE sit_dates_id = r.old_range AND sitter_user_id = r.sitter_user_id AND status = 'applied';
    PERFORM set_config('app.trusted_invite_move', '', true);

    PERFORM public.close_moved_sit_dates(r.old_range);
    v_moved := v_moved + 1;
  END LOOP;

  RAISE NOTICE 'F1e repair: % application(s) moved with their sit, % candidate row(s) left alone (more than one candidate).', v_moved, v_skipped;
END;
$repair$;
