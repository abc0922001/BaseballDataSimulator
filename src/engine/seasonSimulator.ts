import type {
  BatterCountingStats,
  BatterStats,
  DivisionId,
  LeagueAverages,
  LeagueId,
  ScheduleGame,
  SeasonSimulationResult,
  TeamConfig,
  TeamSeasonSummary,
} from './types.ts';
import type { PRNG } from './prng.ts';
import {
  PYTHAGOREAN_EXPONENT,
  REPLACEMENT_RUNS_PER_600_PA,
  RUNS_PER_WIN,
  WAR_WEIGHTS,
  WOBA_WEIGHTS,
  createLeagueTeams,
} from './constants.ts';
import { createEmptyCountingStats, simulateGame } from './gameSimulator.ts';
import { generateMLBSchedule } from './scheduleGenerator.ts';

export interface HeadToHeadRecord {
  wins: number;
  losses: number;
}

export type HeadToHeadMap = Map<string, HeadToHeadRecord>;

function makeH2HKey(teamA: string, teamB: string): string {
  return `${teamA}__vs__${teamB}`;
}

export function getHeadToHeadWinPct(
  h2hMap: HeadToHeadMap,
  teamA: string,
  teamB: string
): number {
  const rec = h2hMap.get(makeH2HKey(teamA, teamB));
  if (!rec || rec.wins + rec.losses === 0) return 0.5;
  return rec.wins / (rec.wins + rec.losses);
}

/**
 * Compares two teams using the official 4-step tiebreaker hierarchy:
 * 1. Overall Win% (or W when G is equal)
 * 2. Head-to-Head Win% (A vs B)
 * 3. Intradivision Win%
 * 4. Run Differential (R - RA)
 * 5. Total Runs Scored (R)
 * Returns negative if teamA ranks higher (better) than teamB.
 */
export function compareTeamsWithTiebreaker(
  teamA: TeamSeasonSummary,
  teamB: TeamSeasonSummary,
  h2hMap: HeadToHeadMap
): number {
  if (Math.abs(teamB.winPct - teamA.winPct) > 1e-9) {
    return teamB.winPct - teamA.winPct;
  }

  // Tiebreaker 1: Head-to-Head Win%
  const h2hA = getHeadToHeadWinPct(h2hMap, teamA.teamId, teamB.teamId);
  const h2hB = getHeadToHeadWinPct(h2hMap, teamB.teamId, teamA.teamId);
  if (Math.abs(h2hB - h2hA) > 1e-9) {
    return h2hB - h2hA;
  }

  // Tiebreaker 2: Intradivision Win%
  const intraGamesA = teamA.intradivisionW + teamA.intradivisionL;
  const intraGamesB = teamB.intradivisionW + teamB.intradivisionL;
  const intraPctA = intraGamesA > 0 ? teamA.intradivisionW / intraGamesA : 0.5;
  const intraPctB = intraGamesB > 0 ? teamB.intradivisionW / intraGamesB : 0.5;
  if (Math.abs(intraPctB - intraPctA) > 1e-9) {
    return intraPctB - intraPctA;
  }

  // Tiebreaker 3: Run Differential (R - RA)
  if (teamB.runDiff !== teamA.runDiff) {
    return teamB.runDiff - teamA.runDiff;
  }

  // Tiebreaker 4: Total Runs Scored (R)
  if (teamB.r !== teamA.r) {
    return teamB.r - teamA.r;
  }

  return teamA.teamId.localeCompare(teamB.teamId);
}

/**
 * Evaluates division ranks, 3 Division Champions, and 3 Wild Cards per league.
 * Mutates the TeamSeasonSummary array in place and returns it.
 */
export function resolveStandingsAndPostseason(
  teams: TeamSeasonSummary[],
  h2hMap: HeadToHeadMap
): TeamSeasonSummary[] {
  const leagues: LeagueId[] = ['AL', 'NL'];
  const divisions: DivisionId[] = ['East', 'Central', 'West'];

  for (const lg of leagues) {
    const nonChamps: TeamSeasonSummary[] = [];

    for (const div of divisions) {
      const divTeams = teams.filter((t) => t.league === lg && t.division === div);
      divTeams.sort((a, b) => compareTeamsWithTiebreaker(a, b, h2hMap));

      divTeams.forEach((team, idx) => {
        team.divisionRank = idx + 1;
        if (idx === 0) {
          team.isDivisionChampion = true;
          team.isWildCard = false;
          team.madePostseason = true;
        } else {
          team.isDivisionChampion = false;
          team.isWildCard = false;
          team.madePostseason = false;
          nonChamps.push(team);
        }
      });
    }

    // Wild Card: sort remaining 12 teams in the league
    nonChamps.sort((a, b) => compareTeamsWithTiebreaker(a, b, h2hMap));
    nonChamps.forEach((team, idx) => {
      if (idx < 3) {
        team.isWildCard = true;
        team.madePostseason = true;
      }
    });
  }

  return teams;
}

export function computePythagoreanWinPct(r: number, ra: number): number {
  if (r <= 0 && ra <= 0) return 0.5;
  const rExp = Math.pow(Math.max(1, r), PYTHAGOREAN_EXPONENT);
  const raExp = Math.pow(Math.max(1, ra), PYTHAGOREAN_EXPONENT);
  return rExp / (rExp + raExp);
}

export function computeBatterDerivedStats(
  counting: BatterCountingStats,
  playerId: string,
  playerName: string,
  teamId: string,
  teamAbbrev: string,
  isUserTeam: boolean,
  slot: number,
  attributes: TeamConfig['lineup'][number]['attributes'],
  lg: LeagueAverages
): BatterStats {
  const { pa, ab, h, single, double, triple, hr, tb, bb, k, sb, cs, gidp } = counting;

  const avg = ab > 0 ? h / ab : 0;
  const obp = pa > 0 ? (h + bb) / pa : 0;
  const slg = ab > 0 ? tb / ab : 0;
  const ops = obp + slg;
  const iso = slg - avg;
  const babipDenom = ab - k - hr;
  const babip = babipDenom > 0 ? (h - hr) / babipDenom : 0;
  const bbPct = pa > 0 ? bb / pa : 0;
  const kPct = pa > 0 ? k / pa : 0;
  const sbPct = sb + cs > 0 ? sb / (sb + cs) : 0;

  const opsPlus =
    lg.obp > 0 && lg.slg > 0 ? 100 * (obp / lg.obp + slg / lg.slg - 1) : 100;

  const woba =
    pa > 0
      ? (WOBA_WEIGHTS.bb * bb +
          WOBA_WEIGHTS.single * single +
          WOBA_WEIGHTS.double * double +
          WOBA_WEIGHTS.triple * triple +
          WOBA_WEIGHTS.hr * hr) /
        pa
      : 0;

  const wRAA =
    pa > 0 ? ((woba - lg.woba) / WOBA_WEIGHTS.scale) * pa : 0;

  const wrcPlus =
    pa > 0 && lg.runsPerPA > 0
      ? 100 * (1 + wRAA / pa / lg.runsPerPA)
      : 100;

  const lgOpps = lg.single + lg.bb;
  const lgStealRuns =
    WAR_WEIGHTS.sbRunValue * (lg.sb ?? 0) + WAR_WEIGHTS.csRunValue * (lg.cs ?? 0);
  const lgStealRate = lgOpps > 0 ? lgStealRuns / lgOpps : 0;
  const opp = single + bb;
  const rawStealRuns = WAR_WEIGHTS.sbRunValue * sb + WAR_WEIGHTS.csRunValue * cs;
  const wSB = rawStealRuns - opp * lgStealRate;

  const lgGIDPRate =
    lg.ab > 0 && lg.gidp !== undefined ? lg.gidp / lg.ab : 0.012;
  const wGIDP = (lgGIDPRate * ab - gidp) * WAR_WEIGHTS.gidpRunValue;
  const repRuns = pa > 0 ? (REPLACEMENT_RUNS_PER_600_PA / 600) * pa : 0;
  const war = (wRAA + wSB + wGIDP + repRuns) / RUNS_PER_WIN;

  return {
    ...counting,
    playerId,
    playerName,
    teamId,
    teamAbbrev,
    isUserTeam,
    slot,
    attributes: { ...attributes },
    avg,
    obp,
    slg,
    ops,
    iso,
    babip,
    bbPct,
    kPct,
    sbPct,
    opsPlus,
    woba,
    wrcPlus,
    war,
  };
}

/**
 * Simulates a single 162-game (2,430 total games) MLB season.
 */
export function simulateSeason(
  seasonIndex: number,
  teams: TeamConfig[],
  rng: PRNG,
  schedule?: ScheduleGame[]
): SeasonSimulationResult {
  const activeTeams = teams.length === 30 ? teams : createLeagueTeams();
  const seasonSchedule = schedule ?? generateMLBSchedule();

  const teamMap = new Map<string, TeamConfig>();
  const teamSummariesMap = new Map<string, TeamSeasonSummary>();
  const teamBatterStatsMap = new Map<string, BatterCountingStats[]>();
  const h2hMap: HeadToHeadMap = new Map();

  for (const t of activeTeams) {
    teamMap.set(t.id, t);
    teamSummariesMap.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      teamAbbrev: t.abbrev,
      league: t.league,
      division: t.division,
      isUserTeam: t.isUserTeam,
      g: 0,
      w: 0,
      l: 0,
      winPct: 0,
      r: 0,
      ra: 0,
      runDiff: 0,
      runsPerGame: 0,
      runsAllowedPerGame: 0,
      pythWinPct: 0.5,
      pythW: 81,
      divisionRank: 1,
      isDivisionChampion: false,
      isWildCard: false,
      madePostseason: false,
      intradivisionW: 0,
      intradivisionL: 0,
    });
    teamBatterStatsMap.set(
      t.id,
      Array.from({ length: 9 }, () => createEmptyCountingStats())
    );
  }

  const recordH2H = (winnerId: string, loserId: string) => {
    const winKey = makeH2HKey(winnerId, loserId);
    const loseKey = makeH2HKey(loserId, winnerId);
    const wRec = h2hMap.get(winKey) ?? { wins: 0, losses: 0 };
    wRec.wins += 1;
    h2hMap.set(winKey, wRec);

    const lRec = h2hMap.get(loseKey) ?? { wins: 0, losses: 0 };
    lRec.losses += 1;
    h2hMap.set(loseKey, lRec);
  };

  // Run all 2,430 games
  for (let i = 0; i < seasonSchedule.length; i++) {
    const sched = seasonSchedule[i];
    const awayTeam = teamMap.get(sched.awayTeamId)!;
    const homeTeam = teamMap.get(sched.homeTeamId)!;
    const awayStats = teamBatterStatsMap.get(sched.awayTeamId)!;
    const homeStats = teamBatterStatsMap.get(sched.homeTeamId)!;

    const result = simulateGame(
      sched.gameId,
      awayTeam,
      homeTeam,
      awayStats,
      homeStats,
      rng
    );

    const awaySum = teamSummariesMap.get(sched.awayTeamId)!;
    const homeSum = teamSummariesMap.get(sched.homeTeamId)!;

    awaySum.g += 1;
    homeSum.g += 1;
    awaySum.r += result.awayRuns;
    awaySum.ra += result.homeRuns;
    homeSum.r += result.homeRuns;
    homeSum.ra += result.awayRuns;

    if (result.awayRuns > result.homeRuns) {
      awaySum.w += 1;
      homeSum.l += 1;
      recordH2H(awayTeam.id, homeTeam.id);
      if (sched.isIntradivision) {
        awaySum.intradivisionW += 1;
        homeSum.intradivisionL += 1;
      }
    } else {
      homeSum.w += 1;
      awaySum.l += 1;
      recordH2H(homeTeam.id, awayTeam.id);
      if (sched.isIntradivision) {
        homeSum.intradivisionW += 1;
        awaySum.intradivisionL += 1;
      }
    }
  }

  // Finalize team summaries
  const teamSummaries: TeamSeasonSummary[] = [];
  for (const t of activeTeams) {
    const sum = teamSummariesMap.get(t.id)!;
    sum.winPct = sum.g > 0 ? sum.w / sum.g : 0;
    sum.runDiff = sum.r - sum.ra;
    sum.runsPerGame = sum.g > 0 ? sum.r / sum.g : 0;
    sum.runsAllowedPerGame = sum.g > 0 ? sum.ra / sum.g : 0;
    sum.pythWinPct = computePythagoreanWinPct(sum.r, sum.ra);
    sum.pythW = sum.g * sum.pythWinPct;
    teamSummaries.push(sum);
  }

  resolveStandingsAndPostseason(teamSummaries, h2hMap);

  // Compute League Averages across all 270 batters
  let lgPA = 0;
  let lgAB = 0;
  let lgR = 0;
  let lgH = 0;
  let lg1B = 0;
  let lg2B = 0;
  let lg3B = 0;
  let lgHR = 0;
  let lgTB = 0;
  let lgBB = 0;
  let lgK = 0;
  let lgSB = 0;
  let lgCS = 0;
  let lgGIDP = 0;

  for (const t of activeTeams) {
    const bList = teamBatterStatsMap.get(t.id)!;
    for (let i = 0; i < 9; i++) {
      const b = bList[i];
      lgPA += b.pa;
      lgAB += b.ab;
      lgR += b.r;
      lgH += b.h;
      lg1B += b.single;
      lg2B += b.double;
      lg3B += b.triple;
      lgHR += b.hr;
      lgTB += b.tb;
      lgBB += b.bb;
      lgK += b.k;
      lgSB += b.sb;
      lgCS += b.cs;
      lgGIDP += b.gidp;
    }
  }

  const lgAVG = lgAB > 0 ? lgH / lgAB : 0.250;
  const lgOBP = lgPA > 0 ? (lgH + lgBB) / lgPA : 0.320;
  const lgSLG = lgAB > 0 ? lgTB / lgAB : 0.400;
  const lgOPS = lgOBP + lgSLG;
  const lgWOBA =
    lgPA > 0
      ? (WOBA_WEIGHTS.bb * lgBB +
          WOBA_WEIGHTS.single * lg1B +
          WOBA_WEIGHTS.double * lg2B +
          WOBA_WEIGHTS.triple * lg3B +
          WOBA_WEIGHTS.hr * lgHR) /
        lgPA
      : 0.315;
  const totalTeamGames = seasonSchedule.length * 2; // 4,860 team-games
  const leagueAverages: LeagueAverages = {
    pa: lgPA,
    ab: lgAB,
    r: lgR,
    h: lgH,
    single: lg1B,
    double: lg2B,
    triple: lg3B,
    hr: lgHR,
    tb: lgTB,
    bb: lgBB,
    k: lgK,
    avg: lgAVG,
    obp: lgOBP,
    slg: lgSLG,
    ops: lgOPS,
    woba: lgWOBA,
    runsPerGame: totalTeamGames > 0 ? lgR / totalTeamGames : 4.5,
    runsPerPA: lgPA > 0 ? lgR / lgPA : 0.118,
    hrPerTeamSeason: lgHR / activeTeams.length,
    sb: lgSB,
    cs: lgCS,
    gidp: lgGIDP,
  };

  const batters: BatterStats[] = [];
  for (const t of activeTeams) {
    const bList = teamBatterStatsMap.get(t.id)!;
    for (let i = 0; i < 9; i++) {
      const cfg = t.lineup[i];
      batters.push(
        computeBatterDerivedStats(
          bList[i],
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

  return {
    seasonIndex,
    teams: teamSummaries,
    batters,
    leagueAverages,
  };
}
