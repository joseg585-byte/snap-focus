// =============================================================
// SnapFocus — single source of truth for product config.
// Shared by the landing page UI, the billing layer, and the AI routes
// so pricing/credit numbers never drift between them. These mirror the
// `tier_config` table in supabase/migrations/0001_init.sql.
// =============================================================

export type AiAction = "room_check" | "standard_tutor" | "master_coach";
export type TierId = "starter" | "pro" | "ultimate";
export type TopupId = "quick_fix" | "value_pack" | "power_pack";
export type RoomCheckLevel = "quick" | "standard" | "deep";

/** Credit cost per AI action. Authoritative copy lives in `spend_credits()`. */
export const CREDIT_COSTS: Record<AiAction, number> = {
  room_check: 1,
  standard_tutor: 2,
  master_coach: 20,
};

export interface RoomCheckLevelConfig {
  id: RoomCheckLevel;
  name: string;
  cost: number;
  emoji: string;
  tagline: string;
  description: string;
  photoCount: number;
  steps: { title: string; prompt: string }[];
}

/** Per-level cost overrides `spend_credits(p_cost_override=...)`. */
export const ROOM_CHECK_LEVELS: RoomCheckLevelConfig[] = [
  {
    id: "quick",
    name: "Quick Check",
    cost: 1,
    emoji: "🟢",
    tagline: "Snap one photo. AI confirms if it looks clean.",
    description: "One photo, one verdict. The fastest way to get the all-clear.",
    photoCount: 1,
    steps: [{ title: "Room photo", prompt: "Take one photo of the room." }],
  },
  {
    id: "standard",
    name: "Standard Check",
    cost: 2,
    emoji: "🟡",
    tagline: "Take 3 guided photos. AI verifies each angle.",
    description: "Three angles, checked individually and as a whole room.",
    photoCount: 3,
    steps: [
      { title: "Full room view", prompt: "Full room view from the doorway." },
      { title: "Desk & surfaces", prompt: "Desk, dresser, and surfaces." },
      { title: "Closet & storage", prompt: "Closet and storage areas." },
    ],
  },
  {
    id: "deep",
    name: "Deep Inspection",
    cost: 3,
    emoji: "🔴",
    tagline:
      "Guided multi-step inspection. AI checks under the bed, closet, behind furniture. Strictest verification.",
    description: "Four angles including the spots that usually get skipped.",
    photoCount: 4,
    steps: [
      { title: "Full room view", prompt: "Full room view from the doorway." },
      { title: "Under the bed", prompt: "Get low — show under the bed." },
      { title: "Inside the closet", prompt: "Open the closet — show inside." },
      {
        title: "Trash & behind furniture",
        prompt: "Trash can, plus behind furniture or other commonly-skipped spots.",
      },
    ],
  },
];

export function roomCheckLevelConfig(level: RoomCheckLevel): RoomCheckLevelConfig {
  const cfg = ROOM_CHECK_LEVELS.find((l) => l.id === level);
  if (!cfg) throw new Error(`Unknown room check level: ${level}`);
  return cfg;
}

export interface Tier {
  id: TierId;
  name: string;
  priceCents: number;
  monthlyCredits: number;
  flagshipAi: boolean; // Master Focus Coach access
  pdfExport: boolean;
  brandedExport: boolean;
  textRetentionDays: number | null; // null = kept forever
  highlight?: boolean;
  blurb: string;
  features: string[];
}

export const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    priceCents: 499,
    monthlyCredits: 500,
    flagshipAi: false,
    pdfExport: false,
    brandedExport: false,
    textRetentionDays: 30,
    blurb: "Get focused. Room Checks and the everyday Tutor.",
    features: [
      "500 credits / month",
      "Room Check + Standard Tutor",
      "Fast/budget AI models",
      "History kept 30 days",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceCents: 999,
    monthlyCredits: 1000,
    flagshipAi: false,
    pdfExport: true,
    brandedExport: false,
    textRetentionDays: 180,
    highlight: true,
    blurb: "More credits, longer memory, and PDF exports.",
    features: [
      "1,000 credits / month",
      "Everything in Starter",
      "PDF & Word exports",
      "History kept 6 months",
    ],
  },
  {
    id: "ultimate",
    name: "Ultimate",
    priceCents: 1999,
    monthlyCredits: 1500,
    flagshipAi: true,
    pdfExport: true,
    brandedExport: true,
    textRetentionDays: null,
    blurb: "Unlock the Master Focus Coach and keep everything.",
    features: [
      "1,500 credits / month",
      "Master Focus Coach (flagship AI)",
      "Custom branded exports",
      "History kept forever",
    ],
  },
];

export interface TopupPack {
  id: TopupId;
  name: string;
  priceCents: number;
  credits: number;
  blurb: string;
}

export const TOPUP_PACKS: TopupPack[] = [
  { id: "quick_fix", name: "Quick Fix", priceCents: 299, credits: 100, blurb: "A little extra to finish the day." },
  { id: "value_pack", name: "Value Pack", priceCents: 499, credits: 250, blurb: "Best value for regular users." },
  { id: "power_pack", name: "Power Pack", priceCents: 999, credits: 1000, blurb: "Stock up and never run dry." },
];

export const AI_FEATURES = [
  {
    action: "room_check" as AiAction,
    name: "Room Check",
    cost: CREDIT_COSTS.room_check,
    blurb:
      "Snap a photo and let computer vision verify the room is actually clean — no more arguing about it.",
  },
  {
    action: "standard_tutor" as AiAction,
    name: "Standard Tutor",
    cost: CREDIT_COSTS.standard_tutor,
    blurb:
      "Generate customized lesson plans and study guides tailored to your kid, subject, and grade level.",
  },
  {
    action: "master_coach" as AiAction,
    name: "Master Focus Coach",
    cost: CREDIT_COSTS.master_coach,
    blurb:
      "Our flagship model builds a personal focus plan, breaks down goals, and coaches through distractions.",
  },
];

export const dollars = (cents: number): string =>
  `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
