#!/usr/bin/env node
/**
 * setup-stripe.mjs
 * Idempotent bootstrap of SnapFocus's Stripe Products + Prices.
 *
 * Usage:
 *   export STRIPE_SECRET_KEY=sk_test_...
 *   node scripts/setup-stripe.mjs
 *
 * What it does:
 *   1. Creates (or reuses) 3 subscription Products + recurring monthly Prices
 *   2. Creates (or reuses) 3 top-up Products + one-time Prices
 *   3. Writes .env.local.stripe with all 6 STRIPE_PRICE_* IDs
 *
 * Idempotent: reuses Products whose `name` matches; reuses Prices whose
 * unit_amount, currency, recurring interval, and product all match.
 */

import Stripe from "stripe";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error("ERROR: STRIPE_SECRET_KEY env var is required.");
  console.error("       Get it from https://dashboard.stripe.com/test/apikeys");
  process.exit(1);
}
if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) {
  console.error("ERROR: STRIPE_SECRET_KEY does not look like a Stripe secret key.");
  process.exit(1);
}
const isLive = secret.startsWith("sk_live_");
if (isLive) {
  console.warn("⚠️  You're using a LIVE Stripe key. This will create real products.");
}

const stripe = new Stripe(secret, { apiVersion: "2025-09-30.clover" });

// ----- Catalog -----
// envKey is the name of the env var we emit (STRIPE_PRICE_<envKey>).
const SUBSCRIPTIONS = [
  {
    envKey: "STARTER",
    name: "SnapFocus Starter",
    description: "50 monthly credits.",
    unit_amount: 499, // $4.99
    metadata: { sf_sku: "starter", sf_credits: "50" },
  },
  {
    envKey: "PRO",
    name: "SnapFocus Pro",
    description: "150 monthly credits.",
    unit_amount: 999, // $9.99
    metadata: { sf_sku: "pro", sf_credits: "150" },
  },
  {
    envKey: "ULTIMATE",
    name: "SnapFocus Ultimate",
    description: "500 monthly credits + Master Focus Coach access.",
    unit_amount: 1999, // $19.99
    metadata: { sf_sku: "ultimate", sf_credits: "500" },
  },
];

const TOPUPS = [
  {
    envKey: "QUICK_FIX",
    name: "Quick Fix Pack",
    description: "25 credits, one-time.",
    unit_amount: 299, // $2.99
    metadata: { sf_sku: "quick_fix", sf_credits: "25" },
  },
  {
    envKey: "VALUE_PACK",
    name: "Value Pack",
    description: "100 credits, one-time.",
    unit_amount: 799, // $7.99
    metadata: { sf_sku: "value_pack", sf_credits: "100" },
  },
  {
    envKey: "POWER_PACK",
    name: "Power Pack",
    description: "250 credits, one-time.",
    unit_amount: 1499, // $14.99
    metadata: { sf_sku: "power_pack", sf_credits: "250" },
  },
];

// ----- Helpers -----
async function findProductByName(name) {
  // Paginate up to 100 active products; SnapFocus has 6, so we won't hit 100.
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.name === name) return product;
  }
  return null;
}

async function upsertProduct(spec) {
  const existing = await findProductByName(spec.name);
  if (existing) {
    // Patch description/metadata so the spec is the source of truth.
    const updated = await stripe.products.update(existing.id, {
      description: spec.description,
      metadata: spec.metadata,
    });
    console.log(`✓ Reusing product  ${spec.name} (${updated.id})`);
    return updated;
  }
  const created = await stripe.products.create({
    name: spec.name,
    description: spec.description,
    metadata: spec.metadata,
  });
  console.log(`+ Created product  ${spec.name} (${created.id})`);
  return created;
}

function priceMatches(price, want) {
  if (!price.active) return false;
  if (price.currency !== "usd") return false;
  if (price.unit_amount !== want.unit_amount) return false;
  if (want.recurring) {
    return price.recurring?.interval === "month" && price.recurring?.interval_count === 1;
  }
  return price.type === "one_time";
}

async function upsertPrice(product, spec) {
  for await (const price of stripe.prices.list({ product: product.id, active: true, limit: 100 })) {
    if (priceMatches(price, spec)) {
      console.log(`  ↳ Reusing price  ${spec.envKey}  $${(spec.unit_amount / 100).toFixed(2)}  (${price.id})`);
      return price;
    }
  }
  const params = {
    product: product.id,
    unit_amount: spec.unit_amount,
    currency: "usd",
    metadata: spec.metadata,
  };
  if (spec.recurring) params.recurring = { interval: "month", interval_count: 1 };
  const created = await stripe.prices.create(params);
  console.log(`  ↳ Created price  ${spec.envKey}  $${(spec.unit_amount / 100).toFixed(2)}  (${created.id})`);
  return created;
}

// ----- Main -----
async function main() {
  console.log(`SnapFocus Stripe bootstrap (${isLive ? "LIVE" : "TEST"} mode)`);
  console.log("─".repeat(60));

  const results = {};

  console.log("\nSubscriptions:");
  for (const spec of SUBSCRIPTIONS) {
    const product = await upsertProduct(spec);
    const price = await upsertPrice(product, { ...spec, recurring: true });
    results[spec.envKey] = price.id;
  }

  console.log("\nTop-ups:");
  for (const spec of TOPUPS) {
    const product = await upsertProduct(spec);
    const price = await upsertPrice(product, { ...spec, recurring: false });
    results[spec.envKey] = price.id;
  }

  const lines = [
    "# Generated by scripts/setup-stripe.mjs — paste into .env.production",
    `# Mode: ${isLive ? "LIVE" : "TEST"}`,
    `# Generated: ${new Date().toISOString()}`,
    "",
    `STRIPE_PRICE_STARTER=${results.STARTER}`,
    `STRIPE_PRICE_PRO=${results.PRO}`,
    `STRIPE_PRICE_ULTIMATE=${results.ULTIMATE}`,
    `STRIPE_PRICE_QUICK_FIX=${results.QUICK_FIX}`,
    `STRIPE_PRICE_VALUE_PACK=${results.VALUE_PACK}`,
    `STRIPE_PRICE_POWER_PACK=${results.POWER_PACK}`,
    "",
  ].join("\n");

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, "..", ".env.local.stripe");
  await writeFile(outPath, lines, "utf8");

  console.log("\n" + "─".repeat(60));
  console.log("Done. Wrote 6 price IDs to:");
  console.log(`  ${outPath}`);
  console.log("\nPaste those 6 lines into .env.production (or your Vercel env vars).");
}

main().catch((err) => {
  console.error("\n✗ Stripe bootstrap failed:", err.message ?? err);
  process.exit(1);
});
