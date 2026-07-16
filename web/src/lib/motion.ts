/** Shared motion tokens for landing choreography (page-load-animations skill). */

export const TIMING = {
  heroTitle: 0.04,
  heroBody: 0.1,
  heroCta: 0.16,
  section: 0.05,
  cardStagger: 0.06,
} as const;

export const SPRING = {
  soft: { type: "spring" as const, stiffness: 320, damping: 30 },
  card: { type: "spring" as const, stiffness: 280, damping: 26 },
  snappy: { type: "spring" as const, stiffness: 400, damping: 32 },
} as const;

export const ENTER_Y = 12;
