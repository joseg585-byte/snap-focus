# SnapFocus

**Focus, verified.** An AI-powered app by **SeJo Labs** for parents and individuals.
Built as a mobile-first Next.js web app, structured to wrap into a native iOS app
(Capacitor) later.

Three AI tools, all gated behind an internal **credit balance** for margin protection:

| Tool | What it does | Cost |
| --- | --- | --- |
| **Room Check** | Computer-vision check that a room is actually clean | 1 credit |
| **Standard Tutor** | Generative customized lesson plans | 2 credits |
| **Master Focus Coach** | Flagship focus coaching (Ultimate only) | 20 credits |

**Tiers:** Starter $4.99 / 500cr · Pro $9.99 / 1,000cr · Ultimate $19.99 / 1,500cr
**Top-ups:** Quick Fix $2.99 / 100cr · Value Pack $4.99 / 250cr · Power Pack $9.99 / 1,000cr

## Stack

- **Next.js 16** (App Router, Server Components) + **React 19** + **TypeScript**
- **Tailwind CSS v4**, hand-rolled shadcn-style UI primitives
- **Supabase** (Postgres + Auth, email/Google/Apple) — schema in `supabase/migrations/0001_init.sql`
- **Stripe** behind an abstract `BillingService` (Apple IAP / RevenueCat swap in later)
- **Vercel AI SDK** routing to OpenAI / Anthropic

## Run it

```bash
npm install
npm run dev          # → http://localhost:3000
npm run build        # production build (exits 0)
```

The landing page renders with **no env vars**. To enable auth / billing / AI,
copy `.env.example` → `.env.local` and fill in keys.

## Project layout

```
supabase/migrations/0001_init.sql   Full schema: profiles, tier_config, credit ledger,
                                    purchases, lesson_plans, room_checks + atomic
                                    spend/grant functions + RLS + signup trigger
src/lib/config.ts                   Single source of truth: tiers, packs, credit costs
src/lib/credits/                    Server-only spend/grant wrappers (call the RPCs)
src/lib/billing/                    Abstract BillingService + Stripe stub + factory
src/lib/supabase/                   Browser + server (+ service-role) clients
src/lib/ai/                         Action→model routing + system prompts
src/app/api/{room-check,tutor,master-coach}/   Route stubs; enforce the hard credit stop
src/components/ui/                   Button / Card / Badge primitives
src/app/page.tsx                    Mobile-first landing (SeJo brand)
```

## Credit safety

Credit math never runs client-side. The `spend_credits` Postgres function locks the
profile row (`for update`), enforces a hard stop, and writes an append-only ledger
entry — so concurrent requests can't double-spend or go negative.
