// Single source of truth for tool credit costs. config.ts and the AI routes
// both read from here so the displayed price and the spent price can never
// drift apart. Authoritative defaults still live in spend_credits() —
// these are the app-side mirror used for display + p_cost_override.
export const TOOL_CREDIT_COSTS = {
  room_check_quick: 1,
  room_check_standard: 3,
  room_check_deep: 6,
  standard_tutor_interactive: 12,
  master_coach_coached: 10,
  master_coach_just_focus: 5,
} as const;
