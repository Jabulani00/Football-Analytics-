import { generateEventsForFixture, hydrateAllMatchEvents } from '@/mock/generators';
import { getFixtureById } from '@/mock/fixturesData';
import type { MatchEvent } from './matchData';

export type MatchEventsBundle = {
  home: MatchEvent[];
  away: MatchEvent[];
};

export const eventsByMatchId: Record<string, MatchEventsBundle> = {
  spl_001: {
    home: [
      { type: 'goal', player: 'Kyogo Furuhashi', minute: 14, assist: 'Daizen Maeda' },
      { type: 'goal', player: "Matt O'Riley", minute: 52, assist: 'Paulo Bernardo' },
      { type: 'yellowCard', player: 'Cameron Carter-Vickers', minute: 67 },
      { type: 'goal', player: 'Kyogo Furuhashi', minute: 78, assist: 'James Forrest' },
    ],
    away: [
      { type: 'goal', player: 'Cyriel Dessers', minute: 38, assist: 'James Tavernier' },
      { type: 'yellowCard', player: 'John Souttar', minute: 55 },
      { type: 'redCard', player: 'Nicolas Raskin', minute: 81 },
    ],
  },
  spl_002: {
    home: [
      { type: 'goal', player: 'Lawrence Shankland', minute: 23, assist: 'João Paulo' },
      { type: 'yellowCard', player: 'Peter Haring', minute: 41 },
      { type: 'goal', player: 'Elie Youan', minute: 71 },
    ],
    away: [
      { type: 'goal', player: 'Bojan Miovski', minute: 18 },
      { type: 'goal', player: 'Duk', minute: 64, assist: 'Nickson Eisdorfer' },
      { type: 'yellowCard', player: 'Graeme Shinnie', minute: 83 },
    ],
  },
  spl_003: {
    home: [
      { type: 'goal', player: 'Martin Boyle', minute: 29, assist: 'Josh Campbell' },
      { type: 'yellowCard', player: 'Warren O\'Hora', minute: 52 },
    ],
    away: [{ type: 'yellowCard', player: 'Liam Polworth', minute: 44 }],
  },
  epl_001: {
    home: [
      { type: 'goal', player: 'Bukayo Saka', minute: 33, assist: 'Martin Ødegaard' },
      { type: 'yellowCard', player: 'Declan Rice', minute: 41 },
      { type: 'goal', player: 'Kai Havertz', minute: 78 },
    ],
    away: [
      { type: 'goal', player: 'Cole Palmer', minute: 56, assist: 'Raheem Sterling' },
      { type: 'yellowCard', player: 'Moises Caicedo', minute: 62 },
    ],
  },
  epl_002: {
    home: [
      { type: 'goal', player: 'Mohamed Salah', minute: 12, assist: 'Darwin Núñez' },
      { type: 'goal', player: 'Luis Díaz', minute: 61 },
      { type: 'yellowCard', player: 'Virgil van Dijk', minute: 68 },
    ],
    away: [
      { type: 'goal', player: 'Erling Haaland', minute: 28, assist: 'Kevin De Bruyne' },
      { type: 'goal', player: 'Phil Foden', minute: 55 },
    ],
  },
  epl_003: {
    home: [
      { type: 'goal', player: 'Alexander Isak', minute: 31, assist: 'Anthony Gordon' },
      { type: 'yellowCard', player: 'Bruno Guimarães', minute: 47 },
    ],
    away: [
      { type: 'yellowCard', player: 'John McGinn', minute: 22 },
      { type: 'yellowCard', player: 'Ezri Konsa', minute: 51 },
    ],
  },
  epl_004: {
    home: [{ type: 'yellowCard', player: 'Joël Veltman', minute: 19 }],
    away: [
      { type: 'goal', player: 'Jarrod Bowen', minute: 27, assist: 'James Ward-Prowse' },
    ],
  },
  epl_005: {
    home: [
      { type: 'goal', player: 'Bruno Fernandes', minute: 15 },
      { type: 'goal', player: 'Alejandro Garnacho', minute: 44, assist: 'Marcus Rashford' },
      { type: 'goal', player: 'Rasmus Højlund', minute: 79 },
      { type: 'yellowCard', player: 'Casemiro', minute: 86 },
    ],
    away: [
      { type: 'goal', player: 'Heung-min Son', minute: 58, assist: 'Dejan Kulusevski' },
      { type: 'yellowCard', player: 'Cristian Romero', minute: 72 },
    ],
  },
  laliga_001: {
    home: [
      { type: 'goal', player: 'Vinícius Jr', minute: 19 },
      { type: 'goal', player: 'Jude Bellingham', minute: 71, assist: 'Rodrygo' },
    ],
    away: [
      { type: 'goal', player: 'Robert Lewandowski', minute: 34, assist: 'Pedri' },
      { type: 'goal', player: 'Raphinha', minute: 88 },
      { type: 'yellowCard', player: 'Gavi', minute: 52 },
    ],
  },
  laliga_002: {
    home: [
      { type: 'goal', player: 'Antoine Griezmann', minute: 38, assist: 'Ángel Correa' },
      { type: 'yellowCard', player: 'José Giménez', minute: 67 },
    ],
    away: [
      { type: 'yellowCard', player: 'Suso', minute: 29 },
      { type: 'yellowCard', player: 'Nemanja Gudelj', minute: 74 },
    ],
  },
  bundesliga_001: {
    home: [
      { type: 'goal', player: 'Harry Kane', minute: 11 },
      { type: 'goal', player: 'Leroy Sané', minute: 38, assist: 'Jamal Musiala' },
      { type: 'goal', player: 'Harry Kane', minute: 62 },
      { type: 'goal', player: 'Thomas Müller', minute: 84 },
    ],
    away: [
      { type: 'goal', player: 'Niclas Füllkrug', minute: 44 },
      { type: 'goal', player: 'Karim Adeyemi', minute: 57, assist: 'Jadon Sancho' },
      { type: 'yellowCard', player: 'Emre Can', minute: 70 },
    ],
  },
  bundesliga_002: {
    home: [
      { type: 'goal', player: 'Lois Openda', minute: 24, assist: 'Xavi Simons' },
      { type: 'yellowCard', player: 'David Raum', minute: 39 },
    ],
    away: [
      { type: 'goal', player: 'Victor Boniface', minute: 51, assist: 'Florian Wirtz' },
    ],
  },
  bundesliga_003: {
    home: [
      { type: 'goal', player: 'Omar Marmoush', minute: 19 },
      { type: 'goal', player: 'Mario Götze', minute: 36, assist: 'Randal Kolo Muani' },
    ],
    away: [{ type: 'yellowCard', player: 'Chris Führich', minute: 31 }],
  },
  bundesliga_004: {
    home: [
      { type: 'yellowCard', player: 'Maximilian Arnold', minute: 33 },
      { type: 'yellowCard', player: 'Kevin Paredes', minute: 61 },
    ],
    away: [
      { type: 'goal', player: 'Vincenzo Grifo', minute: 77, assist: 'Ritsu Doan' },
      { type: 'yellowCard', player: 'Philipp Lienhart', minute: 82 },
    ],
  },
  seriea_001: {
    home: [
      { type: 'goal', player: 'Lautaro Martínez', minute: 22, assist: 'Nicolò Barella' },
      { type: 'goal', player: 'Marcus Thuram', minute: 49 },
      { type: 'goal', player: 'Lautaro Martínez', minute: 81 },
    ],
    away: [
      { type: 'goal', player: 'Rafael Leão', minute: 64, assist: 'Theo Hernández' },
      { type: 'yellowCard', player: 'Tijjani Reijnders', minute: 73 },
    ],
  },
  seriea_002: {
    home: [
      { type: 'goal', player: 'Dusan Vlahović', minute: 27, assist: 'Federico Chiesa' },
      { type: 'goal', player: 'Kenan Yıldız', minute: 68 },
      { type: 'yellowCard', player: 'Manuel Locatelli', minute: 74 },
    ],
    away: [{ type: 'yellowCard', player: 'André-Frank Zambo Anguissa', minute: 55 }],
  },
  seriea_003: {
    home: [
      { type: 'goal', player: 'Paulo Dybala', minute: 41, assist: 'Lorenzo Pellegrini' },
      { type: 'yellowCard', player: 'Gianluca Mancini', minute: 58 },
    ],
    away: [
      { type: 'goal', player: 'Ciro Immobile', minute: 63, assist: 'Taty Castellanos' },
      { type: 'yellowCard', player: 'Matías Vecino', minute: 77 },
    ],
  },
  ligue1_001: {
    home: [
      { type: 'goal', player: 'Kylian Mbappé', minute: 24 },
      { type: 'goal', player: 'Ousmane Dembélé', minute: 51, assist: 'Vitinha' },
      { type: 'goal', player: 'Gonçalo Ramos', minute: 77 },
    ],
    away: [
      { type: 'yellowCard', player: 'Derek Cornelius', minute: 58 },
      { type: 'yellowCard', player: 'Pierre-Emile Højbjerg', minute: 82 },
    ],
  },
  ligue1_002: {
    home: [
      { type: 'goal', player: 'Folarin Balogun', minute: 33, assist: 'Takumi Minamino' },
      { type: 'yellowCard', player: 'Denis Zakaria', minute: 48 },
    ],
    away: [
      { type: 'goal', player: 'Alexandre Lacazette', minute: 52, assist: 'Corentin Tolisso' },
    ],
  },
  eredivisie_001: {
    home: [
      { type: 'goal', player: 'Luuk de Jong', minute: 31 },
      { type: 'goal', player: 'Johan Bakayoko', minute: 69, assist: 'Joey Veerman' },
    ],
    away: [
      { type: 'goal', player: 'Brian Brobbey', minute: 54, assist: 'Steven Berghuis' },
      { type: 'yellowCard', player: 'Kenneth Taylor', minute: 76 },
    ],
  },
  eredivisie_002: {
    home: [
      { type: 'goal', player: 'Santiago Giménez', minute: 12 },
      { type: 'goal', player: 'Igor Paixão', minute: 38, assist: 'Quinten Timber' },
      { type: 'goal', player: 'Santiago Giménez', minute: 71 },
    ],
    away: [{ type: 'yellowCard', player: 'Peer Koopmeiners', minute: 64 }],
  },
  ucl_001: {
    home: [
      { type: 'goal', player: 'Rodrygo', minute: 63, assist: 'Vinícius Jr' },
      { type: 'yellowCard', player: 'Antonio Rüdiger', minute: 71 },
    ],
    away: [
      { type: 'yellowCard', player: 'Rúben Dias', minute: 48 },
      { type: 'yellowCard', player: 'Rodri', minute: 85 },
    ],
  },
  ucl_002: {
    home: [
      { type: 'goal', player: 'Harry Kane', minute: 22 },
      { type: 'goal', player: 'Kingsley Coman', minute: 56, assist: 'Leroy Sané' },
      { type: 'yellowCard', player: 'Joshua Kimmich', minute: 68 },
    ],
    away: [
      { type: 'goal', player: 'Bukayo Saka', minute: 31, assist: 'Martin Ødegaard' },
      { type: 'goal', player: 'Gabriel Martinelli', minute: 79 },
      { type: 'yellowCard', player: 'Declan Rice', minute: 84 },
    ],
  },
};

export function getEventsForMatch(
  matchId: string,
  maxMinute?: number | null,
): MatchEventsBundle {
  let bundle = eventsByMatchId[matchId];
  if (!bundle) {
    const fixture = getFixtureById(matchId);
    if (fixture && fixture.status !== 'NS') {
      bundle = generateEventsForFixture(fixture);
      eventsByMatchId[matchId] = bundle;
    } else {
      return { home: [], away: [] };
    }
  }

  if (maxMinute == null) return bundle;

  const cap = maxMinute;
  const within = (e: MatchEvent) => e.minute <= cap;
  return {
    home: bundle.home.filter(within),
    away: bundle.away.filter(within),
  };
}

export function hasMatchEvents(matchId: string): boolean {
  const bundle = eventsByMatchId[matchId];
  return Boolean(bundle && (bundle.home.length > 0 || bundle.away.length > 0));
}

/** Ensure every FT / LIVE / HT fixture has timeline events. */
hydrateAllMatchEvents(eventsByMatchId);

export { generateEventsForFixture };
