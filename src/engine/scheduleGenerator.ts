import type { DivisionId, LeagueId, ScheduleGame, TeamConfig } from './types.ts';
import { createLeagueTeams } from './constants.ts';

const LEAGUES: readonly LeagueId[] = ['AL', 'NL'];
const DIVISIONS: readonly DivisionId[] = ['East', 'Central', 'West'];

let cachedDefaultSchedule: ScheduleGame[] | null = null;

/**
 * Generates a complete 2,430-game MLB-style 162-game schedule for 30 teams:
 * - Intradivision: 52 games (4 opponents * 13 games; 26 home, 26 away)
 * - Intraleague (other 2 divisions): 64 games (4 opponents * 7 games + 6 opponents * 6 games; 32 home, 32 away)
 * - Interleague: 46 games (1 rival * 4 games + 14 opponents * 3 games; 23 home, 23 away)
 * Total per team: 162 games (81 home, 81 away).
 */
export function generateMLBSchedule(teams?: TeamConfig[]): ScheduleGame[] {
  if (!teams && cachedDefaultSchedule) {
    return cachedDefaultSchedule;
  }

  const allTeams = teams ?? createLeagueTeams();
  const games: ScheduleGame[] = [];
  let nextGameId = 1;

  const addGames = (
    homeId: string,
    awayId: string,
    count: number,
    isIntradivision: boolean,
    isIntraleague: boolean
  ) => {
    for (let i = 0; i < count; i++) {
      games.push({
        gameId: nextGameId++,
        awayTeamId: awayId,
        homeTeamId: homeId,
        isIntradivision,
        isIntraleague,
      });
    }
  };

  // Group teams by league and division (5 teams per division, index 0..4)
  const byLeagueDiv = new Map<string, TeamConfig[]>();
  for (const lg of LEAGUES) {
    for (const div of DIVISIONS) {
      const key = `${lg}-${div}`;
      const divTeams = allTeams.filter((t) => t.league === lg && t.division === div);
      if (divTeams.length !== 5) {
        throw new Error(`Expected 5 teams in ${key}, found ${divTeams.length}`);
      }
      byLeagueDiv.set(key, divTeams);
    }
  }

  // 1. Intradivision games: 52 games per team (26 H, 26 A)
  // Directed cycle of length 5: for d in 1..2, team i hosts (i+d)%5 7 times and visits 6 times
  for (const lg of LEAGUES) {
    for (const div of DIVISIONS) {
      const divTeams = byLeagueDiv.get(`${lg}-${div}`)!;
      for (let i = 0; i < 5; i++) {
        for (const d of [1, 2]) {
          const j = (i + d) % 5;
          const teamI = divTeams[i].id;
          const teamJ = divTeams[j].id;
          // i hosts j 7 times, j hosts i 6 times -> 13 games between i and j
          addGames(teamI, teamJ, 7, true, true);
          addGames(teamJ, teamI, 6, true, true);
        }
      }
    }
  }

  // 2. Intraleague interdivision games: 64 games per team (32 H, 32 A)
  // Cycle of 3 divisions: East (0) -> Central (1) -> West (2) -> East (0)
  for (const lg of LEAGUES) {
    for (let dIdx = 0; dIdx < 3; dIdx++) {
      const divA = DIVISIONS[dIdx];
      const divB = DIVISIONS[(dIdx + 1) % 3];
      const teamsA = byLeagueDiv.get(`${lg}-${divA}`)!;
      const teamsB = byLeagueDiv.get(`${lg}-${divB}`)!;

      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          const diff = (j - i + 5) % 5;
          const idA = teamsA[i].id;
          const idB = teamsB[j].id;
          if (diff === 0 || diff === 1) {
            // 7-game series: A hosts 4, B hosts 3
            addGames(idA, idB, 4, false, true);
            addGames(idB, idA, 3, false, true);
          } else {
            // 6-game series: A hosts 3, B hosts 3
            addGames(idA, idB, 3, false, true);
            addGames(idB, idA, 3, false, true);
          }
        }
      }
    }
  }

  // 3. Interleague games: 46 games per team (23 H, 23 A)
  // Order AL 0..14 and NL 0..14 identically by division (East 0..4, Central 5..9, West 10..14)
  const alTeams: TeamConfig[] = [];
  const nlTeams: TeamConfig[] = [];
  for (const div of DIVISIONS) {
    alTeams.push(...byLeagueDiv.get(`AL-${div}`)!);
    nlTeams.push(...byLeagueDiv.get(`NL-${div}`)!);
  }

  for (let u = 0; u < 15; u++) {
    for (let v = 0; v < 15; v++) {
      const diff = (v - u + 15) % 15;
      const alId = alTeams[u].id;
      const nlId = nlTeams[v].id;
      if (diff === 0) {
        // Same-index interleague rival: 4 games (2 H, 2 A)
        addGames(alId, nlId, 2, false, false);
        addGames(nlId, alId, 2, false, false);
      } else if (diff >= 1 && diff <= 7) {
        // 3 games: AL hosts 2, NL hosts 1
        addGames(alId, nlId, 2, false, false);
        addGames(nlId, alId, 1, false, false);
      } else {
        // diff 8..14 -> 3 games: AL hosts 1, NL hosts 2
        addGames(alId, nlId, 1, false, false);
        addGames(nlId, alId, 2, false, false);
      }
    }
  }

  if (!teams) {
    cachedDefaultSchedule = games;
  }

  return games;
}
