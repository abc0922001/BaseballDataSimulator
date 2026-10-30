import type { BatterConfig, BatterCountingStats, GameResult, PAOutcome, TeamConfig } from './types.ts';
import type { PRNG } from './prng.ts';
import {
  get1stTo3rdOn1BProb,
  get1stToHomeOn2BProb,
  get2ndTo3rdOnOutProb,
  get2ndToHomeOn1BProb,
  get3rdToHomeOnOutProb,
  getGIDPProb,
  getSteal2BAttemptProb,
  getSteal2BSuccessProb,
  getSteal3BAttemptProb,
  getSteal3BSuccessProb,
  resolvePlateAppearance,
} from './probability.ts';
import { computeDeltaRE24, getHomeWinExpectancy } from './winExpectancy.ts';

export interface RunnerOnBase {
  slotIndex: number; // 0..8
  speed: number;
}

export interface BasesState {
  first: RunnerOnBase | null;
  second: RunnerOnBase | null;
  third: RunnerOnBase | null;
}

export function encodeBaseState(bases: BasesState): number {
  return (bases.first ? 1 : 0) | (bases.second ? 2 : 0) | (bases.third ? 4 : 0);
}

export function createEmptyCountingStats(): BatterCountingStats {
  return {
    g: 0,
    pa: 0,
    ab: 0,
    r: 0,
    h: 0,
    single: 0,
    double: 0,
    triple: 0,
    hr: 0,
    tb: 0,
    rbi: 0,
    bb: 0,
    k: 0,
    sb: 0,
    cs: 0,
    gidp: 0,
    re24: 0,
    wpa: 0,
  };
}

export interface PlayContextResult {
  runsScored: number;
  rbiCredited: number;
  outsAdded: number;
  isGIDP: boolean;
}

/**
 * Resolves baserunning and out advancement for a known PAOutcome.
 * Also exported for unit testing specific rule scenarios (e.g., productive out vs K).
 */
export function applyPAOutcomeToBases(
  outcome: PAOutcome,
  batterSlotIndex: number,
  batterConfig: BatterConfig,
  bases: BasesState,
  outs: number,
  battingStats: BatterCountingStats[],
  rng: PRNG
): PlayContextResult {
  const bStat = battingStats[batterSlotIndex];
  const batterRunner: RunnerOnBase = {
    slotIndex: batterSlotIndex,
    speed: batterConfig.attributes.speed,
  };

  let runsScored = 0;
  let rbiCredited = 0;
  let outsAdded = 0;

  const scoreRunner = (runner: RunnerOnBase, countAsRBI: boolean) => {
    runsScored += 1;
    battingStats[runner.slotIndex].r += 1;
    if (countAsRBI) {
      rbiCredited += 1;
    }
  };

  bStat.pa += 1;

  if (outcome === 'BB') {
    bStat.bb += 1;
    // Force advancement
    if (bases.first && bases.second && bases.third) {
      scoreRunner(bases.third, true);
      bases.third = bases.second;
      bases.second = bases.first;
      bases.first = batterRunner;
    } else if (bases.first && bases.second) {
      bases.third = bases.second;
      bases.second = bases.first;
      bases.first = batterRunner;
    } else if (bases.first) {
      bases.second = bases.first;
      bases.first = batterRunner;
    } else {
      bases.first = batterRunner;
    }
    bStat.rbi += rbiCredited;
    return { runsScored, rbiCredited, outsAdded: 0, isGIDP: false };
  }

  // All non-BB outcomes are official At-Bats (AB)
  bStat.ab += 1;

  if (outcome === 'HR') {
    bStat.h += 1;
    bStat.hr += 1;
    bStat.tb += 4;
    if (bases.third) scoreRunner(bases.third, true);
    if (bases.second) scoreRunner(bases.second, true);
    if (bases.first) scoreRunner(bases.first, true);
    scoreRunner(batterRunner, true);
    bases.first = null;
    bases.second = null;
    bases.third = null;
    bStat.rbi += rbiCredited;
    return { runsScored, rbiCredited, outsAdded: 0, isGIDP: false };
  }

  if (outcome === '3B') {
    bStat.h += 1;
    bStat.triple += 1;
    bStat.tb += 3;
    if (bases.third) scoreRunner(bases.third, true);
    if (bases.second) scoreRunner(bases.second, true);
    if (bases.first) scoreRunner(bases.first, true);
    bases.third = batterRunner;
    bases.second = null;
    bases.first = null;
    bStat.rbi += rbiCredited;
    return { runsScored, rbiCredited, outsAdded: 0, isGIDP: false };
  }

  if (outcome === '2B') {
    bStat.h += 1;
    bStat.double += 1;
    bStat.tb += 2;
    if (bases.third) scoreRunner(bases.third, true);
    if (bases.second) scoreRunner(bases.second, true);
    bases.third = null;

    if (bases.first) {
      const pScoreFrom1st = get1stToHomeOn2BProb(bases.first.speed, outs);
      if (rng() < pScoreFrom1st) {
        scoreRunner(bases.first, true);
      } else {
        bases.third = bases.first;
      }
    }
    bases.second = batterRunner;
    bases.first = null;
    bStat.rbi += rbiCredited;
    return { runsScored, rbiCredited, outsAdded: 0, isGIDP: false };
  }

  if (outcome === '1B') {
    bStat.h += 1;
    bStat.single += 1;
    bStat.tb += 1;

    if (bases.third) {
      scoreRunner(bases.third, true);
      bases.third = null;
    }

    if (bases.second) {
      const pScoreFrom2nd = get2ndToHomeOn1BProb(bases.second.speed, outs);
      if (rng() < pScoreFrom2nd) {
        scoreRunner(bases.second, true);
      } else {
        bases.third = bases.second;
      }
      bases.second = null;
    }

    if (bases.first) {
      // If 3rd base is empty, runner on 1st can try to take 3rd
      if (!bases.third) {
        const p1stTo3rd = get1stTo3rdOn1BProb(bases.first.speed);
        if (rng() < p1stTo3rd) {
          bases.third = bases.first;
        } else {
          bases.second = bases.first;
        }
      } else {
        bases.second = bases.first;
      }
    }

    bases.first = batterRunner;
    bStat.rbi += rbiCredited;
    return { runsScored, rbiCredited, outsAdded: 0, isGIDP: false };
  }

  if (outcome === 'K') {
    bStat.k += 1;
    outsAdded = 1;
    return { runsScored: 0, rbiCredited: 0, outsAdded, isGIDP: false };
  }

  // outcome === 'Out' (In-play out)
  if (outs < 2 && bases.first) {
    const pGIDP = getGIDPProb(batterConfig.attributes.speed);
    if (rng() < pGIDP) {
      bStat.gidp += 1;
      outsAdded = 2;
      bases.first = null;

      // If 0 outs initially, after GIDP there are 2 outs:
      // Runner on 3rd scores (no RBI on GIDP), runner on 2nd advances to 3rd
      if (outs + outsAdded < 3) {
        if (bases.third) {
          scoreRunner(bases.third, false);
          bases.third = null;
        }
        if (bases.second) {
          bases.third = bases.second;
          bases.second = null;
        }
      }
      return { runsScored, rbiCredited: 0, outsAdded, isGIDP: true };
    }
  }

  // Standard 1-out in-play out
  outsAdded = 1;
  if (outs + outsAdded < 3) {
    // Productive out opportunities (Sac fly / groundout advancement)
    if (bases.third) {
      const pScore3rd = get3rdToHomeOnOutProb(bases.third.speed);
      if (rng() < pScore3rd) {
        scoreRunner(bases.third, true);
        bases.third = null;
      }
    }
    if (bases.second && !bases.third) {
      const pAdv2nd = get2ndTo3rdOnOutProb(bases.second.speed);
      if (rng() < pAdv2nd) {
        bases.third = bases.second;
        bases.second = null;
      }
    }
  }

  bStat.rbi += rbiCredited;
  return { runsScored, rbiCredited, outsAdded, isGIDP: false };
}

/**
 * Simulates a full 9+ inning baseball game (with traditional extra innings, no ghost runners).
 * Mutates awayStats and homeStats in place to avoid allocations during 72,900-game runs.
 */
export function simulateGame(
  gameId: number,
  awayTeam: TeamConfig,
  homeTeam: TeamConfig,
  awayStats: BatterCountingStats[],
  homeStats: BatterCountingStats[],
  rng: PRNG,
  onInningStart?: (inning: number, isBottom: boolean, bases: BasesState) => void
): GameResult {
  for (let i = 0; i < 9; i++) {
    awayStats[i].g += 1;
    homeStats[i].g += 1;
  }

  let awayRuns = 0;
  let homeRuns = 0;
  let awayBatterIdx = 0;
  let homeBatterIdx = 0;
  let inning = 1;

  while (true) {
    // --- TOP OF INNING (Away Team Batting) ---
    {
      const bases: BasesState = { first: null, second: null, third: null };
      let outs = 0;
      if (onInningStart) onInningStart(inning, false, bases);

      while (outs < 3) {
        // Pre-PA Stolen Base Check
        const stealEndedHalf = tryPrePlateAppearanceSteal(
          bases,
          outs,
          awayStats,
          inning,
          false,
          homeRuns - awayRuns,
          rng
        );
        if (stealEndedHalf.outRecorded) {
          outs += 1;
          if (outs >= 3) break;
        }

        const slotIdx = awayBatterIdx;
        const batter = awayTeam.lineup[slotIdx];
        const baseMaskBefore = encodeBaseState(bases);
        const outsBefore = outs;
        const homeDiffBefore = homeRuns - awayRuns;
        const homeWEBefore = getHomeWinExpectancy(inning, false, outsBefore, baseMaskBefore, homeDiffBefore);

        const outcome = resolvePlateAppearance(batter.attributes, rng);
        const playResult = applyPAOutcomeToBases(
          outcome,
          slotIdx,
          batter,
          bases,
          outs,
          awayStats,
          rng
        );

        awayRuns += playResult.runsScored;
        outs += playResult.outsAdded;
        awayBatterIdx = (awayBatterIdx + 1) % 9;

        const baseMaskAfter = outs >= 3 ? 0 : encodeBaseState(bases);
        const homeDiffAfter = homeRuns - awayRuns;
        const homeWEAfter = getHomeWinExpectancy(inning, false, outs, baseMaskAfter, homeDiffAfter);

        const deltaRE24 = computeDeltaRE24(
          baseMaskBefore,
          outsBefore,
          baseMaskAfter,
          outs,
          playResult.runsScored
        );
        // Away team WPA is -(homeWEAfter - homeWEBefore)
        const awayWPA = homeWEBefore - homeWEAfter;

        awayStats[slotIdx].re24 += deltaRE24;
        awayStats[slotIdx].wpa += awayWPA;
      }
    }

    // Check if Bottom of 9th is unnecessary because Home team already leads
    if (inning >= 9 && homeRuns > awayRuns) {
      return {
        gameId,
        awayTeamId: awayTeam.id,
        homeTeamId: homeTeam.id,
        awayRuns,
        homeRuns,
        innings: inning,
      };
    }

    // --- BOTTOM OF INNING (Home Team Batting) ---
    {
      const bases: BasesState = { first: null, second: null, third: null };
      let outs = 0;
      if (onInningStart) onInningStart(inning, true, bases);

      while (outs < 3) {
        // Pre-PA Stolen Base Check
        const stealEndedHalf = tryPrePlateAppearanceSteal(
          bases,
          outs,
          homeStats,
          inning,
          true,
          homeRuns - awayRuns,
          rng
        );
        if (stealEndedHalf.outRecorded) {
          outs += 1;
          if (outs >= 3) break;
        }

        const slotIdx = homeBatterIdx;
        const batter = homeTeam.lineup[slotIdx];
        const baseMaskBefore = encodeBaseState(bases);
        const outsBefore = outs;
        const homeDiffBefore = homeRuns - awayRuns;
        const homeWEBefore = getHomeWinExpectancy(inning, true, outsBefore, baseMaskBefore, homeDiffBefore);

        const outcome = resolvePlateAppearance(batter.attributes, rng);
        const playResult = applyPAOutcomeToBases(
          outcome,
          slotIdx,
          batter,
          bases,
          outs,
          homeStats,
          rng
        );

        homeRuns += playResult.runsScored;
        outs += playResult.outsAdded;
        homeBatterIdx = (homeBatterIdx + 1) % 9;

        const isWalkOff = inning >= 9 && homeRuns > awayRuns;
        const baseMaskAfter = outs >= 3 ? 0 : encodeBaseState(bases);
        const homeDiffAfter = homeRuns - awayRuns;
        const homeWEAfter = isWalkOff
          ? 1.0
          : getHomeWinExpectancy(inning, true, outs, baseMaskAfter, homeDiffAfter);

        const deltaRE24 = computeDeltaRE24(
          baseMaskBefore,
          outsBefore,
          baseMaskAfter,
          outs,
          playResult.runsScored
        );
        const homeWPA = homeWEAfter - homeWEBefore;

        homeStats[slotIdx].re24 += deltaRE24;
        homeStats[slotIdx].wpa += homeWPA;

        // Walk-off win in Bottom 9+
        if (isWalkOff) {
          return {
            gameId,
            awayTeamId: awayTeam.id,
            homeTeamId: homeTeam.id,
            awayRuns,
            homeRuns,
            innings: inning,
          };
        }
      }
    }

    // End of full inning: check if game is decided in inning 9+
    if (inning >= 9 && homeRuns !== awayRuns) {
      return {
        gameId,
        awayTeamId: awayTeam.id,
        homeTeamId: homeTeam.id,
        awayRuns,
        homeRuns,
        innings: inning,
      };
    }

    inning += 1;
  }
}

/**
 * Checks for stolen base attempt before a Plate Appearance.
 * Credits SB/CS, RE24, and WPA to the runner who attempted the steal.
 */
function tryPrePlateAppearanceSteal(
  bases: BasesState,
  outs: number,
  teamStats: BatterCountingStats[],
  inning: number,
  isBottom: boolean,
  homeScoreDiff: number,
  rng: PRNG
): { attempted: boolean; outRecorded: boolean } {
  // Check steal of 3rd first: runner on 2nd, 3rd empty, < 2 outs, speed >= 65
  if (bases.second && !bases.third && outs < 2) {
    const runner = bases.second;
    const pAttempt3B = getSteal3BAttemptProb(runner.speed);
    if (pAttempt3B > 0 && rng() < pAttempt3B) {
      const baseMaskBefore = encodeBaseState(bases);
      const homeWEBefore = getHomeWinExpectancy(inning, isBottom, outs, baseMaskBefore, homeScoreDiff);
      const pSuccess3B = getSteal3BSuccessProb(runner.speed);
      if (rng() < pSuccess3B) {
        bases.third = runner;
        bases.second = null;
        teamStats[runner.slotIndex].sb += 1;

        const baseMaskAfter = encodeBaseState(bases);
        const homeWEAfter = getHomeWinExpectancy(inning, isBottom, outs, baseMaskAfter, homeScoreDiff);
        teamStats[runner.slotIndex].re24 += computeDeltaRE24(baseMaskBefore, outs, baseMaskAfter, outs, 0);
        teamStats[runner.slotIndex].wpa += isBottom ? homeWEAfter - homeWEBefore : homeWEBefore - homeWEAfter;
        return { attempted: true, outRecorded: false };
      } else {
        bases.second = null;
        teamStats[runner.slotIndex].cs += 1;
        const outsAfter = outs + 1;
        const baseMaskAfter = outsAfter >= 3 ? 0 : encodeBaseState(bases);
        const homeWEAfter = getHomeWinExpectancy(inning, isBottom, outsAfter, baseMaskAfter, homeScoreDiff);
        teamStats[runner.slotIndex].re24 += computeDeltaRE24(baseMaskBefore, outs, baseMaskAfter, outsAfter, 0);
        teamStats[runner.slotIndex].wpa += isBottom ? homeWEAfter - homeWEBefore : homeWEBefore - homeWEAfter;
        return { attempted: true, outRecorded: true };
      }
    }
  }

  // Check steal of 2nd: runner on 1st, 2nd empty, speed >= 45
  if (bases.first && !bases.second) {
    const runner = bases.first;
    const pAttempt2B = getSteal2BAttemptProb(runner.speed);
    if (pAttempt2B > 0 && rng() < pAttempt2B) {
      const baseMaskBefore = encodeBaseState(bases);
      const homeWEBefore = getHomeWinExpectancy(inning, isBottom, outs, baseMaskBefore, homeScoreDiff);
      const pSuccess2B = getSteal2BSuccessProb(runner.speed);
      if (rng() < pSuccess2B) {
        bases.second = runner;
        bases.first = null;
        teamStats[runner.slotIndex].sb += 1;

        const baseMaskAfter = encodeBaseState(bases);
        const homeWEAfter = getHomeWinExpectancy(inning, isBottom, outs, baseMaskAfter, homeScoreDiff);
        teamStats[runner.slotIndex].re24 += computeDeltaRE24(baseMaskBefore, outs, baseMaskAfter, outs, 0);
        teamStats[runner.slotIndex].wpa += isBottom ? homeWEAfter - homeWEBefore : homeWEBefore - homeWEAfter;
        return { attempted: true, outRecorded: false };
      } else {
        bases.first = null;
        teamStats[runner.slotIndex].cs += 1;
        const outsAfter = outs + 1;
        const baseMaskAfter = outsAfter >= 3 ? 0 : encodeBaseState(bases);
        const homeWEAfter = getHomeWinExpectancy(inning, isBottom, outsAfter, baseMaskAfter, homeScoreDiff);
        teamStats[runner.slotIndex].re24 += computeDeltaRE24(baseMaskBefore, outs, baseMaskAfter, outsAfter, 0);
        teamStats[runner.slotIndex].wpa += isBottom ? homeWEAfter - homeWEBefore : homeWEBefore - homeWEAfter;
        return { attempted: true, outRecorded: true };
      }
    }
  }

  return { attempted: false, outRecorded: false };
}
