-- Batch F1e: preview of the one-time repair (20261014220100_batch_f1e_repair.sql).
-- READ-ONLY. Run it on live BEFORE the repair is applied and review each row.
--
-- One row per sit whose range has no accepted application from its Nomad,
-- while an accepted application from that Nomad sits on another range of
-- the same listing with no sit of theirs (confirmed, in progress or
-- completed). The repair, for rows with will_repair = true:
--   - moves application app_id from old_range to the sit's range,
--   - moves that Nomad's "applied" invitation(s) on old_range with it,
--   - deletes old_range if nothing else refers to it, otherwise closes it.
-- Rows with more than one candidate application are left alone (reported).
-- Ids, dates and statuses only: no names or member text.

WITH s AS (
  SELECT si.id AS sit_id, si.status AS sit_status, si.listing_id, si.sitter_user_id, si.sit_dates_id,
         sd.start_date, sd.end_date, sd.status AS range_status
  FROM public.sits si
  JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
  WHERE si.status IN ('confirmed', 'in_progress', 'completed')
    AND NOT EXISTS (SELECT 1 FROM public.applications a
                    WHERE a.sit_dates_id = si.sit_dates_id AND a.sitter_user_id = si.sitter_user_id AND a.status = 'accepted')
),
cand AS (
  SELECT s.sit_id, a.id AS app_id, a.sit_dates_id AS old_range,
         count(*) OVER (PARTITION BY s.sit_id) AS candidates
  FROM s
  JOIN public.applications a
    ON a.listing_id = s.listing_id AND a.sitter_user_id = s.sitter_user_id AND a.status = 'accepted'
   AND a.sit_dates_id <> s.sit_dates_id
  WHERE NOT EXISTS (SELECT 1 FROM public.sits z
                    WHERE z.sit_dates_id = a.sit_dates_id AND z.sitter_user_id = a.sitter_user_id
                      AND z.status IN ('confirmed', 'in_progress', 'completed'))
)
SELECT s.sit_id, s.sit_status, s.sit_dates_id AS sit_range, s.start_date AS sit_start, s.end_date AS sit_end, s.range_status AS sit_range_status,
       c.app_id, c.old_range, od.start_date AS old_start, od.end_date AS old_end, od.status AS old_range_status,
       COALESCE(c.candidates, 0) AS candidates,
       (SELECT count(*) FROM public.sitter_invites i
        WHERE i.sit_dates_id = c.old_range AND i.sitter_user_id = s.sitter_user_id AND i.status = 'applied') AS invites_to_move,
       CASE WHEN c.old_range IS NULL THEN 'nothing to move'
            WHEN EXISTS (SELECT 1 FROM public.applications r WHERE r.sit_dates_id = c.old_range AND r.id <> c.app_id)
              OR EXISTS (SELECT 1 FROM public.sitter_invites i WHERE i.sit_dates_id = c.old_range
                           AND NOT (i.sitter_user_id = s.sitter_user_id AND i.status = 'applied'))
              OR EXISTS (SELECT 1 FROM public.sits z WHERE z.sit_dates_id = c.old_range)
              OR EXISTS (SELECT 1 FROM public.guide_unlock_notifications g WHERE g.sit_dates_id = c.old_range)
            THEN 'closed (still referred to)'
            ELSE 'deleted' END AS old_range_after,
       COALESCE(c.candidates, 0) = 1 AS will_repair
FROM s
LEFT JOIN cand c ON c.sit_id = s.sit_id
LEFT JOIN public.sit_dates od ON od.id = c.old_range
ORDER BY s.start_date;
