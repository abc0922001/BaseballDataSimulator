import type { BatterConfig, DivisionId, LeagueId, PlayerAttributes, TeamConfig } from './types.ts';

export const DEFAULT_ATTRIBUTE = 50;
export const TEAM_BUDGET_LIMIT = 1800;
export const SINGLE_PLAYER_BUDGET_LIMIT = 200;
export const PROGRESSIVE_COST_THRESHOLD = 80;
export const PROGRESSIVE_COST_MULTIPLIER = 2;

export const PYTHAGOREAN_EXPONENT = 1.83;

export const WOBA_WEIGHTS = {
  bb: 0.69,
  single: 0.88,
  double: 1.25,
  triple: 1.58,
  hr: 2.02,
  scale: 1.25,
} as const;

/**
 * 24-state Run Expectancy Matrix RE(baseState, outs) calibrated to ~4.50 R/G environment.
 * baseState is a 3-bit mask:
 *   bit 0 (1): runner on 1st
 *   bit 1 (2): runner on 2nd
 *   bit 2 (4): runner on 3rd
 * Index: [baseState 0..7][outs 0..2]
 */
export const RE24_MATRIX: readonly [number, number, number][] = [
  [0.481, 0.254, 0.098], // 000: Bases empty
  [0.859, 0.509, 0.224], // 001: 1st only
  [1.100, 0.664, 0.319], // 010: 2nd only
  [1.437, 0.884, 0.429], // 011: 1st & 2nd
  [1.350, 0.950, 0.353], // 100: 3rd only
  [1.784, 1.130, 0.478], // 101: 1st & 3rd
  [1.964, 1.376, 0.580], // 110: 2nd & 3rd
  [2.292, 1.541, 0.736], // 111: Bases loaded
];

/**
 * Progressive attribute cost function:
 * 0..80 -> 1:1
 * 81..100 -> 80 + 2 * (x - 80)
 */
export function calculateAttributeCost(value: number): number {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  if (clamped <= PROGRESSIVE_COST_THRESHOLD) {
    return clamped;
  }
  return PROGRESSIVE_COST_THRESHOLD + PROGRESSIVE_COST_MULTIPLIER * (clamped - PROGRESSIVE_COST_THRESHOLD);
}

export function calculatePlayerCost(attrs: PlayerAttributes): number {
  return (
    calculateAttributeCost(attrs.contact) +
    calculateAttributeCost(attrs.power) +
    calculateAttributeCost(attrs.speed) +
    calculateAttributeCost(attrs.eye)
  );
}

export function calculateLineupTotalCost(lineup: BatterConfig[]): number {
  let total = 0;
  for (const batter of lineup) {
    total += calculatePlayerCost(batter.attributes);
  }
  return total;
}

export interface BudgetValidationResult {
  isValid: boolean;
  totalCost: number;
  remainingPoints: number;
  overBudgetPoints: number;
  playerCosts: number[];
  violatingSlots: number[];
}

export function validateLineupBudget(
  lineup: BatterConfig[],
  lockSinglePlayer200: boolean
): BudgetValidationResult {
  const playerCosts = lineup.map((b) => calculatePlayerCost(b.attributes));
  const totalCost = playerCosts.reduce((acc, c) => acc + c, 0);
  const remainingPoints = TEAM_BUDGET_LIMIT - totalCost;
  const overBudgetPoints = Math.max(0, totalCost - TEAM_BUDGET_LIMIT);

  const violatingSlots: number[] = [];
  if (lockSinglePlayer200) {
    lineup.forEach((b, idx) => {
      if (playerCosts[idx] > SINGLE_PLAYER_BUDGET_LIMIT) {
        violatingSlots.push(b.slot);
      }
    });
  }

  const isValid = totalCost <= TEAM_BUDGET_LIMIT && violatingSlots.length === 0;

  return {
    isValid,
    totalCost,
    remainingPoints,
    overBudgetPoints,
    playerCosts,
    violatingSlots,
  };
}

export function createBaselineLineup(teamId = 'AL-E-1', isUserTeam = true): BatterConfig[] {
  return Array.from({ length: 9 }, (_, i) => {
    const slot = i + 1;
    return {
      id: `${teamId}-B${slot}`,
      name: isUserTeam ? `主角隊第 ${slot} 棒` : `${teamId} #${slot}`,
      slot,
      attributes: {
        contact: DEFAULT_ATTRIBUTE,
        power: DEFAULT_ATTRIBUTE,
        speed: DEFAULT_ATTRIBUTE,
        eye: DEFAULT_ATTRIBUTE,
      },
    };
  });
}

export interface TeamSeedMeta {
  id: string;
  name: string;
  abbrev: string;
  league: LeagueId;
  division: DivisionId;
}

export const MLB_30_TEAMS_META: readonly TeamSeedMeta[] = [
  // AL East
  { id: 'AL-E-1', name: 'New York Lab', abbrev: 'NYL', league: 'AL', division: 'East' },
  { id: 'AL-E-2', name: 'Boston Sox', abbrev: 'BOS', league: 'AL', division: 'East' },
  { id: 'AL-E-3', name: 'Toronto Jays', abbrev: 'TOR', league: 'AL', division: 'East' },
  { id: 'AL-E-4', name: 'Baltimore Birds', abbrev: 'BAL', league: 'AL', division: 'East' },
  { id: 'AL-E-5', name: 'Tampa Rays', abbrev: 'TBR', league: 'AL', division: 'East' },
  // AL Central
  { id: 'AL-C-1', name: 'Cleveland Guard', abbrev: 'CLE', league: 'AL', division: 'Central' },
  { id: 'AL-C-2', name: 'Minnesota Twins', abbrev: 'MIN', league: 'AL', division: 'Central' },
  { id: 'AL-C-3', name: 'Detroit Cats', abbrev: 'DET', league: 'AL', division: 'Central' },
  { id: 'AL-C-4', name: 'Kansas Royals', abbrev: 'KCR', league: 'AL', division: 'Central' },
  { id: 'AL-C-5', name: 'Chicago White', abbrev: 'CWS', league: 'AL', division: 'Central' },
  // AL West
  { id: 'AL-W-1', name: 'Houston Stars', abbrev: 'HOU', league: 'AL', division: 'West' },
  { id: 'AL-W-2', name: 'Seattle Mariners', abbrev: 'SEA', league: 'AL', division: 'West' },
  { id: 'AL-W-3', name: 'Texas Rangers', abbrev: 'TEX', league: 'AL', division: 'West' },
  { id: 'AL-W-4', name: 'Anaheim Halos', abbrev: 'LAA', league: 'AL', division: 'West' },
  { id: 'AL-W-5', name: 'Oakland Athletics', abbrev: 'OAK', league: 'AL', division: 'West' },
  // NL East
  { id: 'NL-E-1', name: 'Atlanta Braves', abbrev: 'ATL', league: 'NL', division: 'East' },
  { id: 'NL-E-2', name: 'Philadelphia Bell', abbrev: 'PHI', league: 'NL', division: 'East' },
  { id: 'NL-E-3', name: 'Queens Mets', abbrev: 'NYM', league: 'NL', division: 'East' },
  { id: 'NL-E-4', name: 'Miami Marlins', abbrev: 'MIA', league: 'NL', division: 'East' },
  { id: 'NL-E-5', name: 'Washington Nats', abbrev: 'WSH', league: 'NL', division: 'East' },
  // NL Central
  { id: 'NL-C-1', name: 'Milwaukee Brew', abbrev: 'MIL', league: 'NL', division: 'Central' },
  { id: 'NL-C-2', name: 'St. Louis Cards', abbrev: 'STL', league: 'NL', division: 'Central' },
  { id: 'NL-C-3', name: 'Chicago North', abbrev: 'CHC', league: 'NL', division: 'Central' },
  { id: 'NL-C-4', name: 'Cincinnati Reds', abbrev: 'CIN', league: 'NL', division: 'Central' },
  { id: 'NL-C-5', name: 'Pittsburgh Bucs', abbrev: 'PIT', league: 'NL', division: 'Central' },
  // NL West
  { id: 'NL-W-1', name: 'Los Angeles Blue', abbrev: 'LAD', league: 'NL', division: 'West' },
  { id: 'NL-W-2', name: 'San Diego Friars', abbrev: 'SDP', league: 'NL', division: 'West' },
  { id: 'NL-W-3', name: 'Arizona Snakes', abbrev: 'ARI', league: 'NL', division: 'West' },
  { id: 'NL-W-4', name: 'San Francisco Bay', abbrev: 'SFG', league: 'NL', division: 'West' },
  { id: 'NL-W-5', name: 'Colorado Rocks', abbrev: 'COL', league: 'NL', division: 'West' },
];

export function createLeagueTeams(
  userLineup?: BatterConfig[],
  userTeamId = 'AL-E-1'
): TeamConfig[] {
  return MLB_30_TEAMS_META.map((meta) => {
    const isUser = meta.id === userTeamId;
    const lineup =
      isUser && userLineup
        ? userLineup.map((b, idx) => ({
            id: `${meta.id}-B${idx + 1}`,
            name: b.name || `主角隊第 ${idx + 1} 棒`,
            slot: idx + 1,
            attributes: { ...b.attributes },
          }))
        : createBaselineLineup(meta.id, isUser);
    return {
      id: meta.id,
      name: meta.name,
      abbrev: meta.abbrev,
      league: meta.league,
      division: meta.division,
      isUserTeam: isUser,
      lineup,
    };
  });
}
