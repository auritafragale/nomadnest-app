# Simplify the Nomad dashboard

## What changes

1. **Nomad Mode: remove the "Your stats" card.** Applications are already visible in the "My Applications" card, so the duplicate counts go away. The left column keeps the profile completeness card.
2. **Nomad Mode: remove the "Completed" tab** from "My Applications". Finished sits live in the Upcoming & Past Sits card under "Past".
3. **Pet Parent Mode is untouched** — its "Your stats" card (Listings / Applications) stays exactly as it is.

## Technical notes

- `src/pages/Dashboard.tsx`: in `SitterDashboard`, drop the `StatsTabsCard` block and the now-unused `applicationStats` counts kept only for it (keep `pending` for the header badge). Remove `"completed"` from the `appTab` union, its tab trigger, its filter branch, and the deep-link parsing that accepts `completed`.
- Keep `StatsTabsCard` import/component for the owner dashboard.
