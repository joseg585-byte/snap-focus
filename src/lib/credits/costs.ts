// Single source of truth for tool credit costs. config.ts and the AI routes
// both read from here so the displayed price and the spent price can never
// drift apart. Authoritative defaults still live in spend_credits() —
// these are the app-side mirror used for display + p_cost_override.
export const TOOL_CREDIT_COSTS = {
  clean_check_quick: 1,
  clean_check_standard: 3,
  clean_check_deep: 6,
  homework_check: 3,
  study_quiz: 8,
  master_coach_coached: 10,
  master_coach_just_focus: 5,
  // Aliases kept for any stray V2 references — same values as their V3 names.
  standard_tutor_interactive: 12,
} as const;
