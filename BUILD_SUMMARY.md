# SnapFocus — Build Summary

Status: **Option A scaffold complete.** Compiles, builds green, on GitHub. No live keys required to run.

## Done
- Next.js 16 / React 19 / TS / Tailwind v4 scaffold
- Full Supabase schema migration (`supabase/migrations/0001_init.sql`) — tables, atomic
  credit functions, signup trigger, **RLS policies**
- Shared product config (`src/lib/config.ts`) — tiers, top-up packs, credit costs
- Abstract billing layer (`BillingService` + Stripe stub + factory)
- Server-only credit layer calling the Postgres RPCs (hard-stop enforced)
- Supabase browser/server/service clients
- AI routing layer (action → model) + system prompts
- API route stubs: `/api/room-check`, `/api/tutor`, `/api/master-coach`
- shadcn-style UI primitives (Button/Card/Badge) — no interactive CLI used
- Mobile-first landing page on the SeJo Labs brand

## Next steps (need real keys / services)
1. Create a Supabase project; run the migration; create a public `room-checks` storage bucket.
2. Wire auth pages (email/Google/Apple) using `src/lib/supabase`.
3. Implement `StripeBillingService` (Checkout sessions + webhook → `grant_credits`).
4. Wire the Vercel AI SDK in `src/lib/ai/index.ts` (replace the stub).
5. Add cron endpoints: text retention purge (30/180/∞ by tier) + **48h image purge**.
6. Capacitor wrap for iOS once the web app is solid.

## Deploy
Vercel import is **intentionally left to Jose** (manual, on his phone) — same pattern as
Anthony's and Pigwich. Do not auto-deploy.
