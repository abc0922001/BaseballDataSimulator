import { describe, expect, it } from 'vitest';
import {
  SINGLE_PLAYER_BUDGET_LIMIT,
  TEAM_BUDGET_LIMIT,
  calculateAttributeCost,
  calculateLineupTotalCost,
  calculatePlayerCost,
  createBaselineLineup,
  createLeagueTeams,
  validateLineupBudget,
} from '../src/engine/constants.ts';
import {
  applyPAOutcomeToBases,
  createEmptyCountingStats,
  simulateGame,
} from '../src/engine/gameSimulator.ts';
import { runMonteCarloSimulation } from '../src/engine/monteCarloRunner.ts';
import { createPRNG } from '../src/engine/prng.ts';
import { computePAProbabilities } from '../src/engine/probability.ts';
import { generateMLBSchedule } from '../src/engine/scheduleGenerator.ts';
import {
  type HeadToHeadMap,
  resolveStandingsAndPostseason,
  simulateSeason,
} from '../src/engine/seasonSimulator.ts';
import type { TeamSeasonSummary } from '../src/engine/types.ts';

describe('1.1 Baseline 50 Calibration Suite (TC-BASE-01 ~ 06)', () => {
  // Run 30 seasons once and share across the baseline assertions
  const baseline30 = runMonteCarloSimulation({
    seasons: 30,
    seed: 2026,
  });
  const lg = baseline30.leagueAverages;

  it('TC-BASE-01: League AVG converges within [0.248, 0.252] (target .250)', () => {
    expect(lg.avg).toBeGreaterThanOrEqual(0.248);
    expect(lg.avg).toBeLessThanOrEqual(0.252);
  });

  it('TC-BASE-02: League OBP converges within [0.318, 0.322] (target .320)', () => {
    expect(lg.obp).toBeGreaterThanOrEqual(0.318);
    expect(lg.obp).toBeLessThanOrEqual(0.322);
  });

  it('TC-BASE-03: League SLG converges within [0.396, 0.404] (target .400)', () => {
    expect(lg.slg).toBeGreaterThanOrEqual(0.396);
    expect(lg.slg).toBeLessThanOrEqual(0.404);
  });

  it('TC-BASE-04: League OPS converges within [0.715, 0.725] (target .720)', () => {
    expect(lg.ops).toBeGreaterThanOrEqual(0.715);
    expect(lg.ops).toBeLessThanOrEqual(0.725);
  });

  it('TC-BASE-05: League R/G converges within [4.30, 4.70] (target ~4.50) and HR/team in [165, 190]', () => {
    expect(lg.runsPerGame).toBeGreaterThanOrEqual(4.30);
    expect(lg.runsPerGame).toBeLessThanOrEqual(4.70);
    expect(lg.hrPerTeamSeason).toBeGreaterThanOrEqual(165);
    expect(lg.hrPerTeamSeason).toBeLessThanOrEqual(190);
  });

  it('TC-BASE-06: Standardized OPS+ and wRC+ center at 100 (±1) and mean RE24 near 0', () => {
    const batters = baseline30.allBatters;
    const meanOpsPlus =
      batters.reduce((sum, b) => sum + b.opsPlus, 0) / batters.length;
    const meanWrcPlus =
      batters.reduce((sum, b) => sum + b.wrcPlus, 0) / batters.length;
    const meanRe24 =
      batters.reduce((sum, b) => sum + b.re24, 0) / batters.length;

    expect(meanOpsPlus).toBeGreaterThanOrEqual(99);
    expect(meanOpsPlus).toBeLessThanOrEqual(101);
    expect(meanWrcPlus).toBeGreaterThanOrEqual(99);
    expect(meanWrcPlus).toBeLessThanOrEqual(101);
    expect(Math.abs(meanRe24)).toBeLessThan(1.5);
  });
});

describe('1.2 Attribute Monotonicity & Extreme Value Suite (TC-EXT-01 ~ 04)', () => {
  // Put all 8 extreme test profiles into the user lineup simultaneously over 20 seasons for fast, high-sample verification:
  // Slot 1: Eye = 0
  // Slot 2: Eye = 100
  // Slot 3: Contact = 0
  // Slot 4: Contact = 100
  // Slot 5: Power = 0
  // Slot 6: Power = 100
  // Slot 7: Speed = 0
  // Slot 8: Speed = 100
  // Slot 9: All 50 baseline
  const lineup = createBaselineLineup();
  lineup[0].attributes = { contact: 50, power: 50, speed: 50, eye: 0 };
  lineup[1].attributes = { contact: 50, power: 50, speed: 50, eye: 100 };
  lineup[2].attributes = { contact: 0, power: 50, speed: 50, eye: 50 };
  lineup[3].attributes = { contact: 100, power: 50, speed: 50, eye: 50 };
  lineup[4].attributes = { contact: 50, power: 0, speed: 50, eye: 50 };
  lineup[5].attributes = { contact: 50, power: 100, speed: 50, eye: 50 };
  lineup[6].attributes = { contact: 50, power: 50, speed: 0, eye: 50 };
  lineup[7].attributes = { contact: 50, power: 50, speed: 100, eye: 50 };
  lineup[8].attributes = { contact: 50, power: 50, speed: 50, eye: 50 };

  const extResult = runMonteCarloSimulation({
    userLineup: lineup,
    seasons: 20,
    seed: 9999,
  });
  const b = extResult.userBatters;

  it('TC-EXT-01: Eye 0 vs 50 vs 100 monotonicity and extreme bounds', () => {
    const eye0 = b[0];
    const eye50 = b[8];
    const eye100 = b[1];

    expect(eye0.bbPct).toBeLessThan(0.025);
    expect(eye100.bbPct).toBeGreaterThan(0.220);
    expect(eye100.obp).toBeGreaterThan(0.420);
    expect(eye0.obp).toBeLessThan(eye50.obp);
    expect(eye50.obp).toBeLessThan(eye100.obp);
  });

  it('TC-EXT-02: Contact 0 vs 50 vs 100 monotonicity and extreme bounds', () => {
    const contact0 = b[2];
    const contact50 = b[8];
    const contact100 = b[3];

    expect(contact0.avg).toBeLessThan(0.140);
    expect(contact0.kPct).toBeGreaterThan(contact50.kPct);
    expect(contact100.avg).toBeGreaterThanOrEqual(0.385);
    expect(contact100.avg).toBeLessThanOrEqual(0.415);
    expect(contact100.kPct).toBeLessThan(0.080);
  });

  it('TC-EXT-03: Power 0 vs 50 vs 100 monotonicity and extreme bounds', () => {
    const power0 = b[4];
    const power50 = b[8];
    const power100 = b[5];

    expect(power0.hr).toBeLessThan(5);
    expect(power0.iso).toBeLessThan(0.050);
    expect(power100.hr).toBeGreaterThanOrEqual(70);
    expect(power100.hr).toBeLessThanOrEqual(85);
    expect(power100.slg).toBeGreaterThan(0.650);
    expect(power0.slg).toBeLessThan(power50.slg);
    expect(power50.slg).toBeLessThan(power100.slg);
  });

  it('TC-EXT-04: Speed 0 vs 50 vs 100 stolen bases, GIDP, and triples', () => {
    const speed0 = b[6];
    const speed50 = b[8];
    const speed100 = b[7];

    // Anti-suicide steal protection at Speed < 45
    expect(speed0.sb + speed0.cs).toBe(0);
    expect(speed100.sb).toBeGreaterThan(40);
    expect(speed100.sbPct).toBeGreaterThan(0.85);
    expect(speed100.gidp).toBeLessThan(3);
    expect(speed0.gidp).toBeGreaterThan(speed100.gidp);
    expect(speed100.triple).toBeGreaterThan(speed50.triple);
  });
});

describe('1.3 Baseball Rules & Blind Spot Protection Suite (TC-RULE-01 ~ 06)', () => {
  it('TC-RULE-01: 162-game MLB schedule completeness & home/away balance', () => {
    const teams = createLeagueTeams();
    const schedule = generateMLBSchedule(teams);
    expect(schedule.length).toBe(2430);

    const teamMap = new Map(teams.map((t) => [t.id, t]));
    const stats = new Map<
      string,
      { home: number; away: number; intraDiv: number; intraLg: number; interLg: number }
    >();
    for (const t of teams) {
      stats.set(t.id, { home: 0, away: 0, intraDiv: 0, intraLg: 0, interLg: 0 });
    }

    for (const g of schedule) {
      const away = teamMap.get(g.awayTeamId)!;
      const home = teamMap.get(g.homeTeamId)!;
      const sAway = stats.get(away.id)!;
      const sHome = stats.get(home.id)!;

      sAway.away += 1;
      sHome.home += 1;

      if (away.league === home.league && away.division === home.division) {
        sAway.intraDiv += 1;
        sHome.intraDiv += 1;
      } else if (away.league === home.league) {
        sAway.intraLg += 1;
        sHome.intraLg += 1;
      } else {
        sAway.interLg += 1;
        sHome.interLg += 1;
      }
    }

    for (const [, s] of stats) {
      expect(s.home).toBe(81);
      expect(s.away).toBe(81);
      expect(s.home + s.away).toBe(162);
      expect(s.intraDiv).toBe(52);
      expect(s.intraLg).toBe(64);
      expect(s.interLg).toBe(46);
    }

    // Verify full season wins === 2430 and losses === 2430
    const rng = createPRNG(101);
    const season = simulateSeason(1, teams, rng, schedule);
    const totalW = season.teams.reduce((acc, t) => acc + t.w, 0);
    const totalL = season.teams.reduce((acc, t) => acc + t.l, 0);
    expect(totalW).toBe(2430);
    expect(totalL).toBe(2430);
  });

  it('TC-RULE-02: Traditional extra innings have no ghost runner (bases 000 at start of 10th+)', () => {
    const teams = createLeagueTeams();
    const rng = createPRNG(777);
    let extraInningHalfStarts = 0;

    for (let i = 0; i < 60; i++) {
      const awayStats = Array.from({ length: 9 }, () => createEmptyCountingStats());
      const homeStats = Array.from({ length: 9 }, () => createEmptyCountingStats());
      simulateGame(
        i + 1,
        teams[0],
        teams[1],
        awayStats,
        homeStats,
        rng,
        (inning, _isBottom, bases) => {
          if (inning >= 10) {
            extraInningHalfStarts += 1;
            expect(bases.first).toBeNull();
            expect(bases.second).toBeNull();
            expect(bases.third).toBeNull();
          }
        }
      );
    }
    expect(extraInningHalfStarts).toBeGreaterThan(0);
  });

  it('TC-RULE-03: Productive out advances runner from 3rd with < 2 outs, while K never advances', () => {
    const batter = createBaselineLineup()[0];
    const rng = createPRNG(1234);
    let outRuns = 0;
    let outRBIs = 0;
    let kRuns = 0;

    for (let i = 0; i < 500; i++) {
      const statsOut = Array.from({ length: 9 }, () => createEmptyCountingStats());
      const basesOut = {
        first: null,
        second: null,
        third: { slotIndex: 1, speed: 50 },
      };
      const resOut = applyPAOutcomeToBases('Out', 0, batter, basesOut, 1, statsOut, rng);
      outRuns += resOut.runsScored;
      outRBIs += statsOut[0].rbi;

      const statsK = Array.from({ length: 9 }, () => createEmptyCountingStats());
      const basesK = {
        first: null,
        second: null,
        third: { slotIndex: 1, speed: 50 },
      };
      const resK = applyPAOutcomeToBases('K', 0, batter, basesK, 1, statsK, rng);
      kRuns += resK.runsScored;
    }

    expect(outRuns).toBeGreaterThan(100);
    expect(outRBIs).toBe(outRuns);
    expect(kRuns).toBe(0);
  });

  it('TC-RULE-04: Pure rule home/away without attribute buffs', () => {
    const teams = createLeagueTeams();
    const awayBatter = teams[0].lineup[0];
    const homeBatter = teams[1].lineup[0];

    const pAway = computePAProbabilities(awayBatter.attributes);
    const pHome = computePAProbabilities(homeBatter.attributes);
    expect(pAway).toEqual(pHome);
  });

  it('TC-RULE-05: Division Champions (3) and Wild Cards (3) per league & 4-step tiebreaker', () => {
    const teams = createLeagueTeams();
    const rng = createPRNG(555);
    const season = simulateSeason(1, teams, rng);

    for (const lg of ['AL', 'NL'] as const) {
      const lgTeams = season.teams.filter((t) => t.league === lg);
      const divChamps = lgTeams.filter((t) => t.isDivisionChampion);
      const wildCards = lgTeams.filter((t) => t.isWildCard);
      const postseason = lgTeams.filter((t) => t.madePostseason);

      expect(divChamps.length).toBe(3);
      expect(wildCards.length).toBe(3);
      expect(postseason.length).toBe(6);
    }

    // Explicit tiebreaker hierarchy test (H2H -> Intradivision -> RunDiff -> Runs)
    const mockTeams: TeamSeasonSummary[] = createLeagueTeams().map((t) => ({
      teamId: t.id,
      teamName: t.name,
      teamAbbrev: t.abbrev,
      league: t.league,
      division: t.division,
      isUserTeam: t.isUserTeam,
      g: 162,
      w: 80,
      l: 82,
      winPct: 80 / 162,
      r: 700,
      ra: 700,
      runDiff: 0,
      runsPerGame: 700 / 162,
      runsAllowedPerGame: 700 / 162,
      pythWinPct: 0.5,
      pythW: 81,
      divisionRank: 1,
      isDivisionChampion: false,
      isWildCard: false,
      madePostseason: false,
      intradivisionW: 26,
      intradivisionL: 26,
    }));

    // Tie in AL East at 95 wins between AL-E-1 and AL-E-2; AL-E-2 wins H2H 8-5
    mockTeams[0].w = 95;
    mockTeams[0].l = 67;
    mockTeams[0].winPct = 95 / 162;
    mockTeams[1].w = 95;
    mockTeams[1].l = 67;
    mockTeams[1].winPct = 95 / 162;

    const h2h: HeadToHeadMap = new Map();
    h2h.set('AL-E-2__vs__AL-E-1', { wins: 8, losses: 5 });
    h2h.set('AL-E-1__vs__AL-E-2', { wins: 5, losses: 8 });

    resolveStandingsAndPostseason(mockTeams, h2h);
    const alE1 = mockTeams.find((t) => t.teamId === 'AL-E-1')!;
    const alE2 = mockTeams.find((t) => t.teamId === 'AL-E-2')!;
    expect(alE2.isDivisionChampion).toBe(true);
    expect(alE2.divisionRank).toBe(1);
    expect(alE1.isDivisionChampion).toBe(false);
    expect(alE1.isWildCard).toBe(true);
  });

  it('TC-RULE-06: Deterministic PRNG Seed 100% reproducibility', () => {
    const lineup = createBaselineLineup();
    lineup[0].attributes.power = 100;

    const run1 = runMonteCarloSimulation({
      userLineup: lineup,
      seasons: 10,
      seed: 12345,
    });
    const run2 = runMonteCarloSimulation({
      userLineup: lineup,
      seasons: 10,
      seed: 12345,
    });

    expect(run1.userTeamSummary).toEqual(run2.userTeamSummary);
    expect(run1.userBatters).toEqual(run2.userBatters);
    expect(run1.teamSummaries).toEqual(run2.teamSummaries);
  });
});

describe('1.4 1,800-Point Budget & Progressive Cost Suite (TC-COST-01 ~ 03)', () => {
  it('TC-COST-01: Baseline all-50 team costs exactly 1,800 points (200 per player)', () => {
    expect(calculateAttributeCost(50)).toBe(50);
    const baseline = createBaselineLineup();
    expect(calculatePlayerCost(baseline[0].attributes)).toBe(200);
    expect(calculateLineupTotalCost(baseline)).toBe(TEAM_BUDGET_LIMIT);

    const validation = validateLineupBudget(baseline, true);
    expect(validation.isValid).toBe(true);
    expect(validation.remainingPoints).toBe(0);
  });

  it('TC-COST-02: 81-100 progressive cost calculation (2 points per level above 80)', () => {
    expect(calculateAttributeCost(0)).toBe(0);
    expect(calculateAttributeCost(80)).toBe(80);
    expect(calculateAttributeCost(81)).toBe(82);
    expect(calculateAttributeCost(90)).toBe(100);
    expect(calculateAttributeCost(100)).toBe(120);

    const all100Cost = calculatePlayerCost({
      contact: 100,
      power: 100,
      speed: 100,
      eye: 100,
    });
    expect(all100Cost).toBe(480);
  });

  it('TC-COST-03: Lock single player 200-point switch validation', () => {
    const lineup = createBaselineLineup();
    // Move 10 points from Batter 2 contact (50 -> 40) to Batter 1 contact (50 -> 60)
    lineup[0].attributes.contact = 60; // Batter 1 cost = 210
    lineup[1].attributes.contact = 40; // Batter 2 cost = 190

    const unlocked = validateLineupBudget(lineup, false);
    expect(unlocked.totalCost).toBe(1800);
    expect(unlocked.isValid).toBe(true);
    expect(unlocked.violatingSlots.length).toBe(0);

    const locked = validateLineupBudget(lineup, true);
    expect(locked.totalCost).toBe(1800);
    expect(locked.isValid).toBe(false);
    expect(locked.violatingSlots).toEqual([1]);
    expect(locked.playerCosts[0]).toBeGreaterThan(SINGLE_PLAYER_BUDGET_LIMIT);
  });
});

describe('2.1 Classic Experiment Verification: Baseline All-50 vs 1st Batter Power 100 (30 Seasons)', () => {
  it('QA-EXP-01: 1st Batter Power 100 significantly boosts HR, OPS+, wRC+, WPA, RE24, R/G and Team Wins over 30 seasons', () => {
    const seed = 2026;
    const baselineLineup = createBaselineLineup();
    const power1stLineup = createBaselineLineup();
    power1stLineup[0].attributes.power = 100;

    const baseRes = runMonteCarloSimulation({
      userLineup: baselineLineup,
      seasons: 30,
      seed,
    });
    const expRes = runMonteCarloSimulation({
      userLineup: power1stLineup,
      seasons: 30,
      seed,
    });

    const baseTeam = baseRes.userTeamSummary;
    const expTeam = expRes.userTeamSummary;
    const baseB1 = baseRes.userBatters[0];
    const expB1 = expRes.userBatters[0];

    console.log('=== [Classic Experiment Verification: 30 Seasons (Seed=2026)] ===');
    console.log(
      `Baseline (All 50) League Averages: AVG=${baseRes.leagueAverages.avg.toFixed(4)}, OBP=${baseRes.leagueAverages.obp.toFixed(4)}, SLG=${baseRes.leagueAverages.slg.toFixed(4)}, OPS=${baseRes.leagueAverages.ops.toFixed(4)}, R/G=${baseRes.leagueAverages.runsPerGame.toFixed(3)}, HR/Team=${baseRes.leagueAverages.hrPerTeamSeason.toFixed(1)}`
    );
    console.log(
      `Baseline Team: Avg W=${baseTeam.avgW.toFixed(2)}, Win%=${baseTeam.avgWinPct.toFixed(4)}, PythWin%=${baseTeam.avgPythWinPct.toFixed(4)}, R/G=${baseTeam.avgRunsPerGame.toFixed(2)}, DivTitle%=${baseTeam.divisionTitlePct.toFixed(1)}%, Postseason%=${baseTeam.postseasonBerthPct.toFixed(1)}%`
    );
    console.log(
      `1st Batter Power 100 Team: Avg W=${expTeam.avgW.toFixed(2)} (ΔW=${(expTeam.avgW - baseTeam.avgW >= 0 ? '+' : '') + (expTeam.avgW - baseTeam.avgW).toFixed(2)}), Win%=${expTeam.avgWinPct.toFixed(4)} (ΔWin%=${(expTeam.avgWinPct - baseTeam.avgWinPct >= 0 ? '+' : '') + ((expTeam.avgWinPct - baseTeam.avgWinPct) * 100).toFixed(2)}%), PythWin%=${expTeam.avgPythWinPct.toFixed(4)}, R/G=${expTeam.avgRunsPerGame.toFixed(2)}, DivTitle%=${expTeam.divisionTitlePct.toFixed(1)}%, Postseason%=${expTeam.postseasonBerthPct.toFixed(1)}%`
    );
    console.log(
      `1st Batter Baseline: HR=${baseB1.hr.toFixed(1)}, AVG=${baseB1.avg.toFixed(3)}, OBP=${baseB1.obp.toFixed(3)}, SLG=${baseB1.slg.toFixed(3)}, OPS+=${baseB1.opsPlus.toFixed(1)}, wRC+=${baseB1.wrcPlus.toFixed(1)}, WPA=${baseB1.wpa.toFixed(2)}, RE24=${baseB1.re24.toFixed(1)}`
    );
    console.log(
      `1st Batter Power 100: HR=${expB1.hr.toFixed(1)}, AVG=${expB1.avg.toFixed(3)}, OBP=${expB1.obp.toFixed(3)}, SLG=${expB1.slg.toFixed(3)}, OPS+=${expB1.opsPlus.toFixed(1)}, wRC+=${expB1.wrcPlus.toFixed(1)}, WPA=${expB1.wpa.toFixed(2)}, RE24=${expB1.re24.toFixed(1)}`
    );

    expect(expB1.hr).toBeGreaterThan(70);
    expect(expB1.opsPlus).toBeGreaterThan(150);
    expect(expB1.wrcPlus).toBeGreaterThan(150);
    expect(expB1.wpa).toBeGreaterThan(baseB1.wpa + 2.0);
    expect(expB1.re24).toBeGreaterThan(baseB1.re24 + 35);
    expect(expTeam.avgW).toBeGreaterThan(baseTeam.avgW + 3.0);
    expect(expTeam.avgRunsPerGame).toBeGreaterThan(baseTeam.avgRunsPerGame + 0.25);
  });
});
