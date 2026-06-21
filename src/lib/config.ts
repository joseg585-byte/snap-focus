// =============================================================
// SnapFocus — single source of truth for product config.
// Shared by the landing page UI, the billing layer, and the AI routes
// so pricing/credit numbers never drift between them. These mirror the
// `tier_config` table in supabase/migrations/0003_interactive_tutor_and_master_coach.sql.
// =============================================================
import { TOOL_CREDIT_COSTS } from "@/lib/credits/costs";

export type AiAction = "clean_check" | "homework_check" | "study_quiz" | "master_coach";
export type TierId = "starter" | "pro" | "ultimate";
export type TopupId = "quick_fix" | "value_pack" | "power_pack";
export type CleanCheckLevel = "quick" | "standard" | "deep";

/** Default credit cost per AI action (cheapest variant for clean_check, the
 * "coached" rate for master_coach). Per-mode overrides — clean check levels,
 * Just Focus — live in CLEAN_CHECK_LEVELS / TOOL_CREDIT_COSTS and are passed
 * as `p_cost_override`. Authoritative copy lives in `spend_credits()`. */
export const CREDIT_COSTS: Record<AiAction, number> = {
  clean_check: TOOL_CREDIT_COSTS.clean_check_quick,
  homework_check: TOOL_CREDIT_COSTS.homework_check,
  study_quiz: TOOL_CREDIT_COSTS.study_quiz,
  master_coach: TOOL_CREDIT_COSTS.master_coach_coached,
};

/** Master Focus Coach "Just Focus" mode — Pomodoro timer only, no AI teaching. */
export const MASTER_COACH_JUST_FOCUS_COST = TOOL_CREDIT_COSTS.master_coach_just_focus;

export type CleanCheckArea =
  | "bedroom"
  | "closet"
  | "bathroom"
  | "desk"
  | "kitchen"
  | "playroom"
  | "backyard"
  | "other";

export const CLEAN_CHECK_AREAS: { id: CleanCheckArea; label: string }[] = [
  { id: "bedroom", label: "Bedroom" },
  { id: "closet", label: "Closet" },
  { id: "bathroom", label: "Bathroom" },
  { id: "desk", label: "Desk" },
  { id: "kitchen", label: "Kitchen" },
  { id: "playroom", label: "Playroom" },
  { id: "backyard", label: "Backyard" },
  { id: "other", label: "Other" },
];

export interface CleanCheckLevelConfig {
  id: CleanCheckLevel;
  name: string;
  cost: number;
  emoji: string;
  tagline: string;
  description: string;
  photoCount: number;
  /** Step titles + area-aware prompt templates, filled in once the area is known. */
  stepTemplates: { title: string; promptTemplate: (area: string) => string }[];
}

/** Per-level cost overrides `spend_credits(p_cost_override=...)`. */
export const CLEAN_CHECK_LEVELS: CleanCheckLevelConfig[] = [
  {
    id: "quick",
    name: "Quick Check",
    cost: TOOL_CREDIT_COSTS.clean_check_quick,
    emoji: "🟢",
    tagline: "Snap one photo. AI confirms if it looks clean.",
    description: "One photo, one verdict. The fastest way to get the all-clear.",
    photoCount: 1,
    stepTemplates: [{ title: "Photo", promptTemplate: (area) => `Take one photo of your ${area}.` }],
  },
  {
    id: "standard",
    name: "Standard Check",
    cost: TOOL_CREDIT_COSTS.clean_check_standard,
    emoji: "🟡",
    tagline: "Take 3 guided photos. AI verifies each angle.",
    description: "Three angles, checked individually and as a whole.",
    photoCount: 3,
    stepTemplates: [
      { title: "Full view", promptTemplate: (area) => `Full view of your ${area}.` },
      { title: "Surfaces", promptTemplate: (area) => `Surfaces and any flat spaces in the ${area}.` },
      {
        title: "Storage",
        promptTemplate: (area) => `Storage — closet, cabinet, shelves, or drawers in the ${area}.`,
      },
    ],
  },
  {
    id: "deep",
    name: "Deep Inspection",
    cost: TOOL_CREDIT_COSTS.clean_check_deep,
    emoji: "🔴",
    tagline: "Guided multi-step inspection. AI checks the spots that usually get skipped.",
    description: "Four angles including the spots that usually get skipped.",
    photoCount: 4,
    stepTemplates: [
      { title: "Full view", promptTemplate: (area) => `Full view of your ${area}.` },
      {
        title: "Under & behind",
        promptTemplate: (area) => `Get low — show under furniture or behind big items in the ${area}.`,
      },
      {
        title: "Storage",
        promptTemplate: (area) => `Storage — closet, cabinet, shelves, or drawers in the ${area}.`,
      },
      {
        title: "Trash & hard-to-reach spots",
        promptTemplate: (area) => `Trash can, plus any other commonly-skipped spot in the ${area}.`,
      },
    ],
  },
];

export function cleanCheckLevelConfig(level: CleanCheckLevel): CleanCheckLevelConfig {
  const cfg = CLEAN_CHECK_LEVELS.find((l) => l.id === level);
  if (!cfg) throw new Error(`Unknown clean check level: ${level}`);
  return cfg;
}

/** Resolve a level's steps into concrete titles + prompts for the given area. */
export function cleanCheckSteps(
  level: CleanCheckLevel,
  areaLabel: string
): { title: string; prompt: string }[] {
  return cleanCheckLevelConfig(level).stepTemplates.map((t) => ({
    title: t.title,
    prompt: t.promptTemplate(areaLabel),
  }));
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
    monthlyCredits: 200,
    flagshipAi: false,
    pdfExport: false,
    brandedExport: false,
    textRetentionDays: 30,
    blurb: "All 3 kid tools — Clean Check, Homework Check, Study Quiz.",
    features: [
      "200 credits / month",
      "Clean Check + Homework Check + Study Quiz",
      "Fast/budget AI models",
      "History kept 30 days",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceCents: 999,
    monthlyCredits: 500,
    flagshipAi: false,
    pdfExport: true,
    brandedExport: false,
    textRetentionDays: 180,
    highlight: true,
    blurb: "More credits, longer memory, and PDF exports.",
    features: [
      "500 credits / month",
      "Everything in Starter",
      "PDF & Word exports",
      "History kept 6 months",
    ],
  },
  {
    id: "ultimate",
    name: "Ultimate",
    priceCents: 1999,
    monthlyCredits: 1100,
    flagshipAi: true,
    pdfExport: true,
    brandedExport: true,
    textRetentionDays: null,
    blurb: "Unlock the adult Study Coach and keep everything.",
    features: [
      "1,100 credits / month",
      "Adult Study Coach (flagship AI, beta)",
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

// Power Pack price is staying at $14.99 for this release. Bumping it to
// $15.99 needs a new Stripe Price object (STRIPE_PRICE_POWER_PACK) — tracked
// as a follow-up, not done here.
export const TOPUP_PACKS: TopupPack[] = [
  { id: "quick_fix", name: "Quick Fix", priceCents: 299, credits: 75, blurb: "A little extra to finish the day." },
  { id: "value_pack", name: "Value Pack", priceCents: 799, credits: 275, blurb: "Best value for regular users." },
  { id: "power_pack", name: "Power Pack", priceCents: 1499, credits: 600, blurb: "Stock up and never run dry." },
];

export interface KidTool {
  action: AiAction;
  name: string;
  href: string;
  emoji: string;
  cost: number | string;
  blurb: string;
}

export const KID_TOOLS: KidTool[] = [
  {
    action: "clean_check",
    name: "Clean Check",
    href: "/tools/clean-check",
    emoji: "🧹",
    cost: `from ${Math.min(...CLEAN_CHECK_LEVELS.map((l) => l.cost))} credit`,
    blurb: "Snap a photo of any area and AI verifies it's actually clean — no more arguing about it.",
  },
  {
    action: "homework_check",
    name: "Homework Check",
    href: "/tools/homework-check",
    emoji: "📓",
    cost: CREDIT_COSTS.homework_check,
    blurb: "Snap a photo of finished homework — AI confirms it's complete and spot-checks the answers.",
  },
  {
    action: "study_quiz",
    name: "Study Quiz",
    href: "/tools/study-quiz",
    emoji: "⏱️",
    cost: CREDIT_COSTS.study_quiz,
    blurb: "Pick a subject, study through a Pomodoro timer, then pass an AI quiz to prove it stuck.",
  },
];

/** Demoted adult tool — not on the main dashboard/landing, linked from the footer only. */
export const MASTER_COACH_FEATURE = {
  action: "master_coach" as AiAction,
  name: "Adult Study Coach",
  href: "/tools/focus",
  cost: CREDIT_COSTS.master_coach,
  blurb:
    "Our flagship model builds a coached study plan for any subject and actually teaches you, live, through the session.",
};

export const dollars = (cents: number): string =>
  `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
