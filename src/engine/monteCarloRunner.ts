import type {
  BatterConfig,
  BatterCountingStats,
  BatterStats,
  LeagueAverages,
  MonteCarloResult,
  TeamMonteCarloSummary,
} from './types.ts';
import { WOBA_WEIGHTS, createLeagueTeams } from './constants.ts';
import { createEmptyCountingStats } from './gameSimulator.ts';
import { createPRNG } from './prng.ts';
import { generateMLBSchedule } from './scheduleGenerator.ts';
import {
  computeBatterDerivedStats,
  computePythagoreanWinPct,
  simulateSeason,
} from './seasonSimulator.ts';

export interface MonteCarloOptions {
  userLineup?: BatterConfig[];
  userTeamId?: string;
  seasons: number;
  seed: number;
  onProgress?: (completedSeasons: number, totalSeasons: number) => void;
}

export function runMonteCarloSimulation(options: MonteCarloOptions): MonteCarloResult {
  const {
    userLineup,
    userTeamId = 'AL-E-1',
    seasons,
    seed,
    onProgress,
  } = options;

  const startTime = performance.now();
  const nSeasons = Math.max(1, Math.round(seasons));
  const rng = createPRNG(seed);
  const teams = createLeagueTeams(userLineup, userTeamId);
  const schedule = generateMLBSchedule(teams);

  // Per-team accumulators across N seasons
  const teamAccMap = new Map<
    string,
    {
      wList: number[];
      totalG: number;
      totalW: number;
      totalL: number;
      totalR: number;
      totalRA: number;
      divTitles: number;
      wildCards: number;
      postseasonBerths: number;
    }
  >();

  // Per-batter counting accumulators across N seasons (keyed by playerId)
  const batterAccMap = new Map<string, BatterCountingStats>();

  for (const t of teams) {
    teamAccMap.set(t.id, {
      wList: [],
      totalG: 0,
      totalW: 0,
      totalL: 0,
      totalR: 0,
      totalRA: 0,
      divTitles: 0,
      wildCards: 0,
      postseasonBerths: 0,
    });
    for (const b of t.lineup) {
      batterAccMap.set(b.id, createEmptyCountingStats());
    }
  }

  let totalLgPA = 0;
  let totalLgAB = 0;
  let totalLgR = 0;
  let totalLgH = 0;
  let totalLg1B = 0;
  let totalLg2B = 0;
  let totalLg3B = 0;
  let totalLgHR = 0;
  let totalLgTB = 0;
  let totalLgBB = 0;
  let totalLgK = 0;
  let totalLgSB = 0;
  let totalLgCS = 0;
  let totalLgGIDP = 0;

  for (let s = 0; s < nSeasons; s++) {
    const seasonRes = simulateSeason(s + 1, teams, rng, schedule);

    for (const tSum of seasonRes.teams) {
      const acc = teamAccMap.get(tSum.teamId)!;
      acc.wList.push(tSum.w);
      acc.totalG += tSum.g;
      acc.totalW += tSum.w;
      acc.totalL += tSum.l;
      acc.totalR += tSum.r;
      acc.totalRA += tSum.ra;
      if (tSum.isDivisionChampion) acc.divTitles += 1;
      if (tSum.isWildCard) acc.wildCards += 1;
      if (tSum.madePostseason) acc.postseasonBerths += 1;
    }

    for (const bStat of seasonRes.batters) {
      const bAcc = batterAccMap.get(bStat.playerId)!;
      bAcc.g += bStat.g;
      bAcc.pa += bStat.pa;
      bAcc.ab += bStat.ab;
      bAcc.r += bStat.r;
      bAcc.h += bStat.h;
      bAcc.single += bStat.single;
      bAcc.double += bStat.double;
      bAcc.triple += bStat.triple;
      bAcc.hr += bStat.hr;
      bAcc.tb += bStat.tb;
      bAcc.rbi += bStat.rbi;
      bAcc.bb += bStat.bb;
      bAcc.k += bStat.k;
      bAcc.sb += bStat.sb;
      bAcc.cs += bStat.cs;
      bAcc.gidp += bStat.gidp;
      bAcc.re24 += bStat.re24;
      bAcc.wpa += bStat.wpa;
    }

    const lg = seasonRes.leagueAverages;
    totalLgPA += lg.pa;
    totalLgAB += lg.ab;
    totalLgR += lg.r;
    totalLgH += lg.h;
    totalLg1B += lg.single;
    totalLg2B += lg.double;
    totalLg3B += lg.triple;
    totalLgHR += lg.hr;
    totalLgTB += lg.tb;
    totalLgBB += lg.bb;
    totalLgK += lg.k;
    totalLgSB += lg.sb ?? 0;
    totalLgCS += lg.cs ?? 0;
    totalLgGIDP += lg.gidp ?? 0;

    if (onProgress) {
      onProgress(s + 1, nSeasons);
    }
  }

  // Compute aggregated multi-season league averages (per season basis for counting, overall for rates)
  const lgAVG = totalLgAB > 0 ? totalLgH / totalLgAB : 0.250;
  const lgOBP = totalLgPA > 0 ? (totalLgH + totalLgBB) / totalLgPA : 0.320;
  const lgSLG = totalLgAB > 0 ? totalLgTB / totalLgAB : 0.400;
  const lgOPS = lgOBP + lgSLG;
  const lgWOBA =
    totalLgPA > 0
      ? (WOBA_WEIGHTS.bb * totalLgBB +
          WOBA_WEIGHTS.single * totalLg1B +
          WOBA_WEIGHTS.double * totalLg2B +
          WOBA_WEIGHTS.triple * totalLg3B +
          WOBA_WEIGHTS.hr * totalLgHR) /
        totalLgPA
      : 0.315;

  const totalTeamGamesAcrossSeasons = nSeasons * schedule.length * 2;
  const leagueAverages: LeagueAverages = {
    pa: totalLgPA / nSeasons,
    ab: totalLgAB / nSeasons,
    r: totalLgR / nSeasons,
    h: totalLgH / nSeasons,
    single: totalLg1B / nSeasons,
    double: totalLg2B / nSeasons,
    triple: totalLg3B / nSeasons,
    hr: totalLgHR / nSeasons,
    tb: totalLgTB / nSeasons,
    bb: totalLgBB / nSeasons,
    k: totalLgK / nSeasons,
    avg: lgAVG,
    obp: lgOBP,
    slg: lgSLG,
    ops: lgOPS,
    woba: lgWOBA,
    runsPerGame: totalTeamGamesAcrossSeasons > 0 ? totalLgR / totalTeamGamesAcrossSeasons : 4.5,
    runsPerPA: totalLgPA > 0 ? totalLgR / totalLgPA : 0.118,
    hrPerTeamSeason: totalLgHR / (nSeasons * teams.length),
    sb: totalLgSB / nSeasons,
    cs: totalLgCS / nSeasons,
    gidp: totalLgGIDP / nSeasons,
  };

  // Build TeamMonteCarloSummary list
  const teamSummaries: TeamMonteCarloSummary[] = [];
  for (const t of teams) {
    const acc = teamAccMap.get(t.id)!;
    const avgG = acc.totalG / nSeasons;
    const avgW = acc.totalW / nSeasons;
    const avgL = acc.totalL / nSeasons;
    const avgWinPct = acc.totalG > 0 ? acc.totalW / acc.totalG : 0.5;
    const avgR = acc.totalR / nSeasons;
    const avgRA = acc.totalRA / nSeasons;
    const avgRunDiff = avgR - avgRA;
    const avgRunsPerGame = acc.totalG > 0 ? acc.totalR / acc.totalG : 4.5;
    const avgPythWinPct = computePythagoreanWinPct(acc.totalR, acc.totalRA);
    const avgPythW = avgG * avgPythWinPct;

    let varianceW = 0;
    let minW = Infinity;
    let maxW = -Infinity;
    for (const w of acc.wList) {
      if (w < minW) minW = w;
      if (w > maxW) maxW = w;
      varianceW += (w - avgW) * (w - avgW);
    }
    const stdDevW = nSeasons > 1 ? Math.sqrt(varianceW / (nSeasons - 1)) : 0;
    const margin95 = nSeasons > 1 ? 1.96 * (stdDevW / Math.sqrt(nSeasons)) : 0;

    teamSummaries.push({
      teamId: t.id,
      teamName: t.name,
      teamAbbrev: t.abbrev,
      league: t.league,
      division: t.division,
      isUserTeam: t.isUserTeam,
      seasons: nSeasons,
      avgG,
      avgW,
      avgL,
      stdDevW,
      ci95W: [avgW - margin95, avgW + margin95],
      minW: minW === Infinity ? 0 : minW,
      maxW: maxW === -Infinity ? 0 : maxW,
      avgWinPct,
      avgR,
      avgRA,
      avgRunDiff,
      avgRunsPerGame,
      avgPythWinPct,
      avgPythW,
      divisionTitlePct: (acc.divTitles / nSeasons) * 100,
      wildCardPct: (acc.wildCards / nSeasons) * 100,
      postseasonBerthPct: (acc.postseasonBerths / nSeasons) * 100,
    });
  }

  // Build per-season average BatterStats for all 270 batters
  const allBatters: BatterStats[] = [];
  for (const t of teams) {
    for (const cfg of t.lineup) {
      const totalB = batterAccMap.get(cfg.id)!;
      const avgCounting: BatterCountingStats = {
        g: totalB.g / nSeasons,
        pa: totalB.pa / nSeasons,
        ab: totalB.ab / nSeasons,
        r: totalB.r / nSeasons,
        h: totalB.h / nSeasons,
        single: totalB.single / nSeasons,
        double: totalB.double / nSeasons,
        triple: totalB.triple / nSeasons,
        hr: totalB.hr / nSeasons,
        tb: totalB.tb / nSeasons,
        rbi: totalB.rbi / nSeasons,
        bb: totalB.bb / nSeasons,
        k: totalB.k / nSeasons,
        sb: totalB.sb / nSeasons,
        cs: totalB.cs / nSeasons,
        gidp: totalB.gidp / nSeasons,
        re24: totalB.re24 / nSeasons,
        wpa: totalB.wpa / nSeasons,
      };
      allBatters.push(
        computeBatterDerivedStats(
          avgCounting,
          cfg.id,
          cfg.name,
          t.id,
          t.abbrev,
          t.isUserTeam,
          cfg.slot,
          cfg.attributes,
          leagueAverages
        )
      );
    }
  }

  const userTeamSummary =
    teamSummaries.find((t) => t.teamId === userTeamId) ?? teamSummaries[0];
  const userBatters = allBatters
    .filter((b) => b.teamId === userTeamId)
    .sort((a, b) => a.slot - b.slot);

  const elapsedMs = performance.now() - startTime;

  return {
    seasons: nSeasons,
    seed,
    elapsedMs,
    userTeamId,
    userTeamSummary,
    teamSummaries,
    userBatters,
    allBatters,
    leagueAverages,
  };
}
