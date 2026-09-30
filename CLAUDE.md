# NomadNest

## Design and build rules

Every batch follows these rules.

- **Three widths.** Every screen must work and look designed at phone (375), tablet (768–1023) and desktop (1024+) widths. The phone layout is the base; tablet and desktop follow the patterns in `design-reference/dashboard-redesign/` (NomadTablet, NomadDesktop, ParentDesktop, AvailabilityDesktop). The design reference is never imported or shipped.
- **Two themes, two roles.** Every screen must work in light and dark mode, in both Nomad (coral) and Pet Parent (teal) mode.
- **Simple for all ages.** One main action per screen, plain words, 15–16px body text, tap targets at least 44px. Secondary things open their own page instead of stacking on one screen.
- **Dark text on brand fills.** Text and icons on coral or teal fills are dark (`#1F1B16`, the `primary-foreground` token), never white.
- **Theme tokens only.** Colours come only from theme tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `primary`, `terracotta-light`, `ocean-light`, and the `--nn-*` variables in `src/index.css`). No hardcoded hex, `bg-white` or `text-[#...]`, except the gold Founding Member pill (`#E8B53E` / `#3A2A06`) and photo placeholders.
- **Nothing left behind.** Before removing or replacing any component or page, list every action, link, piece of information and state it had, and where each one now lives. Include that list in the summary. If something has no new home, stop and ask.
- **Privacy.** Members see each other's first names only. Never expose last names, emails, phones, exact locations, addresses, door codes or Welcome Guide content to anyone who shouldn't have them.
- **Accessibility.** Touch targets at least 44px, real buttons and links, aria labels on icon-only buttons, text contrast at least 4.5:1 in both modes.
- **AI features.** New AI features go behind their own `app_settings` flag (off by default, admins allowed), with `ai_usage` limits, and send only the minimum data.
- **Database changes only through Lovable.** Never run `supabase db push` or `migration up` against production. Lovable records its own copy of each migration under a different version number, so our files look unapplied; that is expected. Once Lovable has applied a migration, our duplicate file can be removed after checking the copies match.
- **Deploys.** Include updated Supabase types (`src/integrations/supabase/types.ts`) in any commit that adds database objects. Every Lovable prompt must say: "If the build fails, stop and report. Do not apply any migration or change any database object unless a step tells you to."
