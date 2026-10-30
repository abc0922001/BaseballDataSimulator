export type LeagueId = 'AL' | 'NL';
export type DivisionId = 'East' | 'Central' | 'West';

export type PAOutcome = 'BB' | 'K' | 'Out' | '1B' | '2B' | '3B' | 'HR';

export type ExperimentMode = 'free' | 'budget';

export interface PlayerAttributes {
  contact: number; // 0-100
  power: number;   // 0-100
  speed: number;   // 0-100
  eye: number;     // 0-100
}

export interface BatterConfig {
  id: string;
  name: string;
  slot: number; // 1-9
  attributes: PlayerAttributes;
}

export interface TeamConfig {
  id: string;
  name: string;
  abbrev: string;
  league: LeagueId;
  division: DivisionId;
  isUserTeam: boolean;
  lineup: BatterConfig[]; // 9 batters
}

export interface TheoreticalSlashLine {
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  iso: number;
  bbPct: number;
  kPct: number;
  expectedHRPer650PA: number;
}

export interface BatterCountingStats {
  g: number;
  pa: number;
  ab: number;
  r: number;
  h: number;
  single: number;
  double: number;
  triple: number;
  hr: number;
  tb: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
  cs: number;
  gidp: number;
  re24: number;
  wpa: number;
}

export interface BatterStats extends BatterCountingStats {
  playerId: string;
  playerName: string;
  teamId: string;
  teamAbbrev: string;
  isUserTeam: boolean;
  slot: number;
  attributes: PlayerAttributes;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  iso: number;
  babip: number;
  bbPct: number;
  kPct: number;
  sbPct: number;
  opsPlus: number;
  woba: number;
  wrcPlus: number;
}

export interface ScheduleGame {
  gameId: number;
  awayTeamId: string;
  homeTeamId: string;
  isIntradivision: boolean;
  isIntraleague: boolean;
}

export interface GameResult {
  gameId: number;
  awayTeamId: string;
  homeTeamId: string;
  awayRuns: number;
  homeRuns: number;
  innings: number;
}

export interface TeamSeasonSummary {
  teamId: string;
  teamName: string;
  teamAbbrev: string;
  league: LeagueId;
  division: DivisionId;
  isUserTeam: boolean;
  g: number;
  w: number;
  l: number;
  winPct: number;
  r: number;
  ra: number;
  runDiff: number;
  runsPerGame: number;
  runsAllowedPerGame: number;
  pythWinPct: number;
  pythW: number;
  divisionRank: number;
  isDivisionChampion: boolean;
  isWildCard: boolean;
  madePostseason: boolean;
  intradivisionW: number;
  intradivisionL: number;
}

export interface LeagueAverages {
  pa: number;
  ab: number;
  r: number;
  h: number;
  single: number;
  double: number;
  triple: number;
  hr: number;
  tb: number;
  bb: number;
  k: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  woba: number;
  runsPerGame: number;
  runsPerPA: number;
  hrPerTeamSeason: number;
}

export interface SeasonSimulationResult {
  seasonIndex: number;
  teams: TeamSeasonSummary[];
  batters: BatterStats[];
  leagueAverages: LeagueAverages;
}

export interface TeamMonteCarloSummary {
  teamId: string;
  teamName: string;
  teamAbbrev: string;
  league: LeagueId;
  division: DivisionId;
  isUserTeam: boolean;
  seasons: number;
  avgG: number;
  avgW: number;
  avgL: number;
  stdDevW: number;
  ci95W: [number, number];
  minW: number;
  maxW: number;
  avgWinPct: number;
  avgR: number;
  avgRA: number;
  avgRunDiff: number;
  avgRunsPerGame: number;
  avgPythWinPct: number;
  avgPythW: number;
  divisionTitlePct: number;
  wildCardPct: number;
  postseasonBerthPct: number;
}

export interface MonteCarloResult {
  seasons: number;
  seed: number;
  elapsedMs: number;
  userTeamId: string;
  userTeamSummary: TeamMonteCarloSummary;
  teamSummaries: TeamMonteCarloSummary[];
  userBatters: BatterStats[];
  allBatters: BatterStats[];
  leagueAverages: LeagueAverages;
}

export interface ExperimentSnapshot {
  id: string;
  name: string;
  createdAt: string;
  mode: ExperimentMode;
  lockSinglePlayer200: boolean;
  seed: number;
  seasons: number;
  totalBudgetUsed: number;
  userLineup: BatterConfig[];
  result: MonteCarloResult;
}

export interface SimulationWorkerRequest {
  type: 'RUN_SIMULATION';
  userLineup: BatterConfig[];
  userTeamId?: string;
  seasons: number;
  seed: number;
}

export type SimulationWorkerResponse =
  | {
      type: 'PROGRESS';
      completedSeasons: number;
      totalSeasons: number;
    }
  | {
      type: 'COMPLETE';
      result: MonteCarloResult;
    }
  | {
      type: 'ERROR';
      message: string;
    };
