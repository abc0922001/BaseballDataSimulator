import { RE24_MATRIX } from './constants.ts';

/**
 * Returns the Run Expectancy (RE24) for a given base state (0..7) and outs (0..3).
 * baseState mask: 1 = 1B, 2 = 2B, 4 = 3B.
 */
export function getRunExpectancy(baseState: number, outs: number): number {
  if (outs >= 3 || outs < 0) return 0;
  const row = RE24_MATRIX[baseState & 7];
  if (!row) return 0;
  return row[outs as 0 | 1 | 2] ?? 0;
}

/**
 * Computes the change in Run Expectancy (RE24) for a play:
 * ΔRE24 = (RE_after - RE_before) + runsScoredOnPlay
 */
export function computeDeltaRE24(
  baseStateBefore: number,
  outsBefore: number,
  baseStateAfter: number,
  outsAfter: number,
  runsScoredOnPlay: number
): number {
  const reBefore = getRunExpectancy(baseStateBefore, outsBefore);
  const reAfter = outsAfter >= 3 ? 0 : getRunExpectancy(baseStateAfter, outsAfter);
  return reAfter - reBefore + runsScoredOnPlay;
}

/**
 * Standard normal cumulative distribution function Φ(z) approximation (Abramowitz & Stegun).
 */
function normalCDF(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/**
 * Computes the Home Team Win Expectancy WE in [0, 1] given the game state:
 * - inning: 1-based inning number (1..9, or 10+ for extra innings)
 * - isBottom: false for Top of inning (Away batting), true for Bottom of inning (Home batting)
 * - outs: 0, 1, 2, or 3 (3 means half-inning just ended)
 * - baseState: 0..7 bitmask (1B=1, 2B=2, 3B=4)
 * - homeScoreDiff: homeRuns - awayRuns
 */
export function getHomeWinExpectancy(
  inning: number,
  isBottom: boolean,
  outs: number,
  baseState: number,
  homeScoreDiff: number
): number {
  // Terminal states check
  if (inning >= 9) {
    // End of Top 9+ and Home leads -> Home wins immediately
    if (!isBottom && outs >= 3 && homeScoreDiff > 0) {
      return 1.0;
    }
    // During Bottom 9+ and Home takes lead -> Walk-off win immediately
    if (isBottom && homeScoreDiff > 0) {
      return 1.0;
    }
    // End of Bottom 9+ and Away leads -> Away wins immediately
    if (isBottom && outs >= 3 && homeScoreDiff < 0) {
      return 0.0;
    }
  }

  const RUNS_PER_HALF_INNING = 0.50; // ~4.50 runs per 9 innings
  const VAR_PER_HALF_INNING = 0.88;  // Overdispersed run variance per half inning

  // Remaining full half-innings after the current half-inning in regulation (or current extra inning)
  const targetInning = Math.max(9, inning);
  const fullInningsAfterThis = targetInning - inning;

  const currentRE = outs >= 3 ? 0 : getRunExpectancy(baseState, outs);
  // Fraction of current half-inning variance remaining based on outs
  const currentVar = outs >= 3 ? 0 : VAR_PER_HALF_INNING * ((3 - outs) / 3) * (1 + 0.15 * (baseState > 0 ? 1 : 0));

  let expectedAwayRemaining = fullInningsAfterThis * RUNS_PER_HALF_INNING;
  let expectedHomeRemaining = fullInningsAfterThis * RUNS_PER_HALF_INNING;
  let varAway = fullInningsAfterThis * VAR_PER_HALF_INNING;
  let varHome = fullInningsAfterThis * VAR_PER_HALF_INNING;

  if (!isBottom) {
    // Top of inning: Away is batting right now, Home still has Bottom of this inning
    expectedAwayRemaining += currentRE;
    varAway += currentVar;
    expectedHomeRemaining += RUNS_PER_HALF_INNING;
    varHome += VAR_PER_HALF_INNING;
  } else {
    // Bottom of inning: Away is done for this inning, Home is batting right now
    expectedHomeRemaining += currentRE;
    varHome += currentVar;
  }

  // Add baseline residual variance for potential extra innings tie-breaking
  const totalStdDev = Math.sqrt(varHome + varAway + 0.32);
  // Expected final margin for Home (with +0.02 slight walk-off structural edge when tied)
  const expectedFinalHomeMargin =
    homeScoreDiff + (expectedHomeRemaining - expectedAwayRemaining) + 0.02;

  const z = expectedFinalHomeMargin / totalStdDev;
  return Math.max(0.001, Math.min(0.999, normalCDF(z)));
}
