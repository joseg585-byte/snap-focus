# Stripe Bootstrap — RUNME

This script creates the 6 SnapFocus Products + Prices in your Stripe account and writes their IDs to `.env.local.stripe`. It's idempotent — safe to re-run.

## 1. Grab your Stripe Test secret key

1. Sign in to <https://dashboard.stripe.com>.
2. Top-right toggle → make sure you're in **Test mode**.
3. Left sidebar → **Developers** → **API keys**.
4. Under "Standard keys", click **Reveal test key** next to "Secret key".
5. Copy the value (starts with `sk_test_...`).

## 2. Run the script (Windows PowerShell)

```powershell
cd C:\dev\snapfocus
$env:STRIPE_SECRET_KEY = "sk_test_..."   # paste yours
node scripts/setup-stripe.mjs
```

Or cmd.exe:

```cmd
cd C:\dev\snapfocus
set STRIPE_SECRET_KEY=sk_test_...
node scripts/setup-stripe.mjs
```

Or bash/zsh:

```bash
cd C:\dev\snapfocus && export STRIPE_SECRET_KEY=sk_test_... && node scripts/setup-stripe.mjs
```

Takes ~30 seconds. Output looks like:

```
SnapFocus Stripe bootstrap (TEST mode)
────────────────────────────────────────────────────────────

Subscriptions:
+ Created product  SnapFocus Starter (prod_...)
  ↳ Created price  STARTER  $4.99  (price_...)
+ Created product  SnapFocus Pro (prod_...)
  ↳ Created price  PRO  $9.99  (price_...)
...

Done. Wrote 6 price IDs to:
  C:\dev\snapfocus\.env.local.stripe
```

## 3. What gets created

| Product               | Type         | Price   | Credits |
| --------------------- | ------------ | ------- | ------- |
| SnapFocus Starter     | Subscription | $4.99/m | 50      |
| SnapFocus Pro         | Subscription | $9.99/m | 150     |
| SnapFocus Ultimate    | Subscription | $19.99/m| 500     |
| Quick Fix Pack        | One-time     | $2.99   | 25      |
| Value Pack            | One-time     | $7.99   | 100     |
| Power Pack            | One-time     | $14.99  | 250     |

## 4. Next step

Open `.env.local.stripe`, copy the 6 `STRIPE_PRICE_*` lines, and paste them into `.env.production` (or directly into Vercel's project env vars).

## Re-running

Safe to re-run any time. The script matches existing products by name and existing prices by amount/currency/interval, so it won't create duplicates. If you change a price amount in the script, it'll create a new Price (Stripe never lets you mutate prices in place) — that's fine.
