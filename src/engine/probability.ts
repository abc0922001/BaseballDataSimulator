import type { PAOutcome, PlayerAttributes, TheoreticalSlashLine } from './types.ts';
import type { PRNG } from './prng.ts';
import { WAR_WEIGHTS, WOBA_WEIGHTS } from './constants.ts';

/**
 * Piecewise linear interpolation anchored at x=0, x=50, x=100.
 */
export function lerp3(x: number, v0: number, v50: number, v100: number): number {
  const c = Math.max(0, Math.min(100, x));
  if (c <= 50) {
    return v0 + (c / 50) * (v50 - v0);
  }
  return v50 + ((c - 50) / 50) * (v100 - v50);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export interface PAProbabilities {
  pBB: number;
  pHitGivenAB: number;
  pKGivenABOut: number;
  pHRGivenHit: number;
  p3BGivenHit: number;
  p2BGivenHit: number;
  p1BGivenHit: number;
}

export function computePAProbabilities(attrs: PlayerAttributes): PAProbabilities {
  const { contact: C, power: P, speed: S, eye: E } = attrs;

  // Stage 1: Walk check
  // P(BB) = (0.320 - 0.250) / (1 - 0.250) = 0.07 / 0.75 = 7/75 = 0.09333333333333334 at E=50
  const pBB = lerp3(E, 0.015, 7 / 75, 0.250);

  // Stage 2: Contact & Hit check (given AB)
  const avgBase = lerp3(C, 0.120, 0.250, 0.400);
  const deltaAvgSpeed = ((S - 50) / 50) * 0.015;
  const pHitGivenAB = clamp(avgBase + deltaAvgSpeed, 0.080, 0.450);

  // K vs Out (given AB Out)
  const pKGivenABOut = clamp(
    lerp3(C, 0.550, 0.295, 0.080) - ((E - 50) / 50) * 0.030,
    0.030,
    0.650
  );

  // Stage 3: Hit Type check (given Hit)
  const pHRGivenHit = lerp3(P, 0.010, 0.128, 0.495);

  const p3BRaw = lerp3(S, 0.002, 0.016, 0.060);
  const p3BGivenHit = p3BRaw * ((1 - pHRGivenHit) / (1 - 0.128));

  const p2BRaw =
    0.75 * lerp3(P, 0.080, 0.184, 0.340) +
    0.25 * lerp3(S, 0.100, 0.184, 0.260);
  const p2BGivenHit =
    p2BRaw * ((1 - pHRGivenHit - p3BGivenHit) / (1 - 0.128 - 0.016));

  const p1BGivenHit = Math.max(0, 1 - pHRGivenHit - p3BGivenHit - p2BGivenHit);

  return {
    pBB,
    pHitGivenAB,
    pKGivenABOut,
    pHRGivenHit,
    p3BGivenHit,
    p2BGivenHit,
    p1BGivenHit,
  };
}

/**
 * Resolve a single Plate Appearance using three-stage random check.
 */
export function resolvePlateAppearance(attrs: PlayerAttributes, rng: PRNG): PAOutcome {
  const probs = computePAProbabilities(attrs);

  // Stage 1: Walk check
  if (rng() < probs.pBB) {
    return 'BB';
  }

  // Stage 2: Hit vs Out check
  if (rng() < probs.pHitGivenAB) {
    // Stage 3: Hit type check
    const rHit = rng();
    if (rHit < probs.pHRGivenHit) {
      return 'HR';
    }
    if (rHit < probs.pHRGivenHit + probs.p3BGivenHit) {
      return '3B';
    }
    if (rHit < probs.pHRGivenHit + probs.p3BGivenHit + probs.p2BGivenHit) {
      return '2B';
    }
    return '1B';
  }

  // Out type: K vs In-play Out
  if (rng() < probs.pKGivenABOut) {
    return 'K';
  }
  return 'Out';
}

/**
 * Compute theoretical slash line and expected rates for UI preview.
 */
export function estimateTheoreticalSlashLine(attrs: PlayerAttributes): TheoreticalSlashLine {
  const probs = computePAProbabilities(attrs);
  const avg = probs.pHitGivenAB;
  const obp = probs.pBB + (1 - probs.pBB) * avg;

  const expectedBasesPerHit =
    1 * probs.p1BGivenHit +
    2 * probs.p2BGivenHit +
    3 * probs.p3BGivenHit +
    4 * probs.pHRGivenHit;

  const slg = avg * expectedBasesPerHit;
  const ops = obp + slg;
  const iso = slg - avg;
  const bbPct = probs.pBB;
  const kPct = (1 - probs.pBB) * (1 - avg) * probs.pKGivenABOut;
  const expectedHRPer650PA = 650 * (1 - probs.pBB) * avg * probs.pHRGivenHit;

  const expPA = 650;
  const pBB = probs.pBB;
  const p1B = (1 - pBB) * avg * probs.p1BGivenHit;
  const p2B = (1 - pBB) * avg * probs.p2BGivenHit;
  const p3B = (1 - pBB) * avg * probs.p3BGivenHit;
  const pHR = (1 - pBB) * avg * probs.pHRGivenHit;
  const theoreticalWOBA =
    WOBA_WEIGHTS.bb * pBB +
    WOBA_WEIGHTS.single * p1B +
    WOBA_WEIGHTS.double * p2B +
    WOBA_WEIGHTS.triple * p3B +
    WOBA_WEIGHTS.hr * pHR;

  const lgWOBA = 0.315;
  const wRAA = ((theoreticalWOBA - lgWOBA) / WOBA_WEIGHTS.scale) * expPA;

  const pAtt = getSteal2BAttemptProb(attrs.speed);
  const pSucc = getSteal2BSuccessProb(attrs.speed);
  const expSB = 50 * pAtt * pSucc;
  const expCS = 50 * pAtt * (1 - pSucc);
  const wSB = WAR_WEIGHTS.sbRunValue * expSB + WAR_WEIGHTS.csRunValue * expCS;

  const repRuns = (WAR_WEIGHTS.replacementRunsPer600PA / 600) * expPA;
  const expectedWARPer650PA = (wRAA + wSB + repRuns) / WAR_WEIGHTS.runsPerWin;

  return {
    avg,
    obp,
    slg,
    ops,
    iso,
    bbPct,
    kPct,
    expectedHRPer650PA,
    expectedWARPer650PA,
  };
}

/**
 * Stolen Base probabilities for 2B and 3B.
 */
export function getSteal2BAttemptProb(runnerSpeed: number): number {
  if (runnerSpeed < 45) return 0;
  if (runnerSpeed <= 50) {
    return ((runnerSpeed - 45) / 5) * 0.055;
  }
  return 0.055 + ((runnerSpeed - 50) / 50) * (0.400 - 0.055);
}

export function getSteal2BSuccessProb(runnerSpeed: number): number {
  return lerp3(runnerSpeed, 0.50, 0.76, 0.90);
}

export function getSteal3BAttemptProb(runnerSpeed: number): number {
  if (runnerSpeed < 65) return 0;
  return getSteal2BAttemptProb(runnerSpeed) * 0.25;
}

export function getSteal3BSuccessProb(runnerSpeed: number): number {
  return lerp3(runnerSpeed, 0.45, 0.70, 0.86);
}

/**
 * Extra-base advancement probabilities on hits.
 */
export function get1stToHomeOn2BProb(runnerSpeed: number, outs: number): number {
  return clamp(
    lerp3(runnerSpeed, 0.25, 0.59, 0.92) + (outs === 2 ? 0.12 : 0),
    0,
    0.98
  );
}

export function get2ndToHomeOn1BProb(runnerSpeed: number, outs: number): number {
  return clamp(
    lerp3(runnerSpeed, 0.35, 0.69, 0.94) + (outs === 2 ? 0.12 : 0),
    0,
    0.98
  );
}

export function get1stTo3rdOn1BProb(runnerSpeed: number): number {
  return lerp3(runnerSpeed, 0.15, 0.39, 0.80);
}

/**
 * GIDP and Productive Out advancement probabilities on in-play outs (< 2 outs).
 */
export function getGIDPProb(batterSpeed: number): number {
  return lerp3(batterSpeed, 0.20, 0.080, 0.015);
}

export function get3rdToHomeOnOutProb(runner3Speed: number): number {
  return lerp3(runner3Speed, 0.28, 0.43, 0.62);
}

export function get2ndTo3rdOnOutProb(runner2Speed: number): number {
  return lerp3(runner2Speed, 0.20, 0.33, 0.54);
}
