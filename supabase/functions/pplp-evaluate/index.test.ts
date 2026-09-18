import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ===== UNIT TESTS FOR LS-Math-v1.0 FUNCTIONS =====

// ===== UNIT TESTS FOR MATH FUNCTIONS =====

// Replicate LS-Math functions locally for unit testing
function calculateConsistencyMultiplier(streakDays: number): number {
  return 1 + 0.6 * (1 - Math.exp(-streakDays / 30));
}

function calculateSequenceMultiplier(bonus: number): number {
  return 1 + 0.5 * Math.tanh(bonus / 5);
}

function calculateIntegrityPenalty(integrityScore: number): number {
  const risk = 1 - integrityScore;
  return 1 - Math.min(0.5, 0.8 * risk);
}

function calculateUnityMultiplier(unityScore: number): number {
  return Math.max(0.5, Math.min(2.5, 0.5 + (unityScore / 50)));
}

function calculateLightScore(
  br: number, q: number, i: number, k: number,
  ux: number, mCons: number, mSeq: number, penalty: number
): number {
  return Math.round(br * q * i * k * ux * mCons * mSeq * penalty * 100) / 100;
}

Deno.test("LS-Math: consistency multiplier range", () => {
  // streak=0 → M_cons = 1.0
  const m0 = calculateConsistencyMultiplier(0);
  assertEquals(m0, 1.0);

  // streak=30 → ~1.38 (1 + 0.6*(1 - e^-1))
  const m30 = calculateConsistencyMultiplier(30);
  assertEquals(m30 > 1.3 && m30 < 1.4, true, `Expected ~1.38, got ${m30}`);

  // streak=365 → approaches 1.6
  const m365 = calculateConsistencyMultiplier(365);
  assertEquals(m365 > 1.5 && m365 <= 1.6, true, `Expected ~1.6, got ${m365}`);
});

Deno.test("LS-Math: sequence multiplier range", () => {
  const m0 = calculateSequenceMultiplier(0);
  assertEquals(m0, 1.0);

  const m10 = calculateSequenceMultiplier(10);
  assertEquals(m10 > 1.4 && m10 < 1.5, true, `Expected ~1.48, got ${m10}`);
});

Deno.test("LS-Math: integrity penalty range", () => {
  // Perfect integrity → no penalty
  const p1 = calculateIntegrityPenalty(1.0);
  assertEquals(p1, 1.0);

  // Zero integrity → max penalty 0.5
  const p0 = calculateIntegrityPenalty(0.0);
  assertEquals(p0, 0.5);

  // Mid integrity (0.5) → penalty = 1 - min(0.5, 0.8*0.5) = 1 - 0.4 = 0.6
  const pMid = calculateIntegrityPenalty(0.5);
  assertEquals(pMid, 0.6);
});

Deno.test("LS-Math: unity multiplier boundaries", () => {
  // unity=0 → 0.5 (min)
  assertEquals(calculateUnityMultiplier(0), 0.5);
  // unity=100 → 2.5 (max)
  assertEquals(calculateUnityMultiplier(100), 2.5);
  // unity=50 → 1.5 (mid)
  assertEquals(calculateUnityMultiplier(50), 1.5);
});

Deno.test("LS-Math: full Light Score calculation for post", () => {
  // Post with good scores: BR=50, Q=1.5, I=2.0, K=0.9, U=60(Ux=1.7), streak=10, bonus=3
  const br = 50;
  const q = 1.5, i = 2.0, k = 0.9;
  const ux = calculateUnityMultiplier(60); // 1.7
  const mCons = calculateConsistencyMultiplier(10); // ~1.17
  const mSeq = calculateSequenceMultiplier(3); // ~1.27
  const penalty = calculateIntegrityPenalty(0.9); // 1 - min(0.5, 0.08) = 0.92

  const ls = calculateLightScore(br, q, i, k, ux, mCons, mSeq, penalty);
  // Should be a reasonable positive number
  assertEquals(ls > 100, true, `Post LS should be >100, got ${ls}`);
  assertEquals(ls < 1000, true, `Post LS should be <1000, got ${ls}`);
});

Deno.test("LS-Math: AI fallback defaults produce conservative score", () => {
  // With new conservative defaults: Q=0.6, I=0.6, K=0.7, U=30
  const br = 200; // livestream (worst case)
  const q = 0.6, i = 0.6, k = 0.7;
  const ux = calculateUnityMultiplier(30); // 1.1
  const mCons = calculateConsistencyMultiplier(0); // 1.0
  const mSeq = calculateSequenceMultiplier(0); // 1.0
  const penalty = calculateIntegrityPenalty(0.7); // 1 - min(0.5, 0.24) = 0.76

  const ls = calculateLightScore(br, q, i, k, ux, mCons, mSeq, penalty);
  
  // With old defaults (1.0/1.0/1.0/50): would be 200 * 1 * 1 * 1 * 1.5 * 1 * 1 * 1 = 300
  // With new defaults: should be much lower
  assertEquals(ls < 100, true, `Fallback LS for livestream should be <100 (was 300 before), got ${ls}`);
});

Deno.test("LS-Math: spam content gets low integrity penalty", () => {
  // Spam with integrity=0.1
  const penalty = calculateIntegrityPenalty(0.1);
  assertEquals(penalty, 0.5, "Max penalty should apply for integrity=0.1"); // 1 - min(0.5, 0.72) = 0.5

  const br = 10; // reaction
  const ls = calculateLightScore(br, 0.5, 0.5, 0.1, 0.5, 1, 1, penalty);
  assertEquals(ls < 1, true, `Spam LS should be <1, got ${ls}`);
});
