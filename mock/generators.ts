import type { Fixture } from '@/mock/fixturesData';
import { mockFixtures } from '@/mock/fixturesData';
import type { MatchEvent } from '@/mock/matchData';
import type { StandingRow } from '@/mock/matchData';
import type { MatchEventsBundle } from '@/mock/eventsData';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const HOME_PLAYERS = ['Home Striker', 'Home Midfielder', 'Home Winger', 'Home Defender'];
const AWAY_PLAYERS = ['Away Striker', 'Away Midfielder', 'Away Winger', 'Away Defender'];
const ASSISTS = ['Teammate A', 'Teammate B', 'Set Piece', 'Cross'];

/** Deterministic match events for any FT / LIVE / HT fixture. */
export function generateEventsForFixture(fixture: Fixture): MatchEventsBundle {
  const s = hash(fixture.id);
  const hGoals = Math.max(0, fixture.homeTeam.score ?? 0);
  const aGoals = Math.max(0, fixture.awayTeam.score ?? 0);
  const home: MatchEvent[] = [];
  const away: MatchEvent[] = [];

  let minute = 8 + (s % 12);
  for (let g = 0; g < hGoals; g++) {
    home.push({
      type: 'goal',
      player: `${fixture.homeTeam.shortName} ${HOME_PLAYERS[g % HOME_PLAYERS.length]}`,
      minute: Math.min(90, minute),
      assist: g % 2 === 0 ? ASSISTS[(s + g) % ASSISTS.length] : undefined,
    });
    minute += 14 + ((s + g * 7) % 18);
  }

  minute = 12 + ((s >> 4) % 10);
  for (let g = 0; g < aGoals; g++) {
    away.push({
      type: 'goal',
      player: `${fixture.awayTeam.shortName} ${AWAY_PLAYERS[g % AWAY_PLAYERS.length]}`,
      minute: Math.min(90, minute),
      assist: g % 2 === 1 ? ASSISTS[(s + g + 2) % ASSISTS.length] : undefined,
    });
    minute += 16 + ((s + g * 11) % 15);
  }

  if ((s % 5) > 1) {
    home.push({
      type: 'yellowCard',
      player: `${fixture.homeTeam.shortName} Defender`,
      minute: 28 + (s % 40),
    });
  }
  if ((s % 4) === 0) {
    away.push({
      type: 'yellowCard',
      player: `${fixture.awayTeam.shortName} Midfielder`,
      minute: 35 + (s % 35),
    });
  }
  if ((s % 11) === 0) {
    away.push({
      type: 'redCard',
      player: `${fixture.awayTeam.shortName} Player`,
      minute: 72 + (s % 15),
    });
  }
  if ((s % 13) === 0 && hGoals + aGoals >= 3) {
    home.push({
      type: 'substitution',
      player: `${fixture.homeTeam.shortName} Sub`,
      minute: 70 + (s % 18),
    });
  }

  return {
    home: home.sort((a, b) => a.minute - b.minute),
    away: away.sort((a, b) => a.minute - b.minute),
  };
}

const FORM_CHARS: ('W' | 'D' | 'L')[] = ['W', 'D', 'L'];

function formFromSeed(seed: number): StandingRow['form'] {
  return Array.from({ length: 5 }, (_, i) => FORM_CHARS[(seed + i) % 3]);
}

/** Build a league table from unique teams in fixtures (e.g. UCL group). */
export function generateStandingsFromFixtures(leagueId: string): StandingRow[] {
  const fixtures = mockFixtures[leagueId] ?? [];
  const teams = new Set<string>();
  for (const f of fixtures) {
    teams.add(f.homeTeam.name);
    teams.add(f.awayTeam.name);
  }

  const rows: StandingRow[] = [...teams].map((team) => {
    const s = hash(leagueId + team);
    const played = 6 + (s % 8);
    const won = 2 + (s % 5);
    const drawn = 1 + (s % 3);
    const lost = Math.max(0, played - won - drawn);
    const gf = 8 + (s % 22);
    const ga = 6 + ((s >> 3) % 18);
    const points = won * 3 + drawn;
    return {
      pos: 0,
      team,
      played,
      won,
      drawn,
      lost,
      gf,
      ga,
      gd: gf - ga,
      points,
      form: formFromSeed(s),
    };
  });

  return rows
    .sort((a, b) => b.points - a.points || b.gd - a.gd)
    .map((r, i) => ({ ...r, pos: i + 1 }));
}

/** Fill missing events for all started fixtures. */
export function hydrateAllMatchEvents(
  store: Record<string, MatchEventsBundle>,
): void {
  for (const fixtures of Object.values(mockFixtures)) {
    for (const f of fixtures) {
      if (f.status === 'NS') continue;
      if (!store[f.id] || (store[f.id].home.length === 0 && store[f.id].away.length === 0)) {
        store[f.id] = generateEventsForFixture(f);
      }
    }
  }
}
