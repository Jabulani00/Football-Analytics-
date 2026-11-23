import { buildPinnacleFixtureOdds } from '../services/pinnacleOdds';

const rows = [
  { eventId: 7, fixture: 'Alpha vs Bravo', kickoff: '2026-11-23T12:00:00Z', marketName: 'Full Time', selection: 'Home' },
  { eventId: 7, fixture: 'Alpha vs Bravo', kickoff: '2026-11-23T12:00:00Z', marketName: 'Full Time', selection: 'Draw' },
  { eventId: 7, fixture: 'Alpha vs Bravo', kickoff: '2026-11-23T12:00:00Z', marketName: 'Full Time', selection: 'Away' },
  { eventId: 8, fixture: 'Charlie vs Delta', kickoff: '2026-11-23T14:00:00Z', marketName: 'Full Time', selection: 'Home' },
];
const fixtureIds = new Map([[7, 101], [8, 102]]);

const result = buildPinnacleFixtureOdds(
  rows,
  fixtureIds,
  [
    { fixture_id: 101, market_key: 'ft_result', outcome: 'home', odds: 2.1, unix: 1, bookmaker_id: 47, datetime: '2026-11-22T10:00:00Z' },
    { fixture_id: 101, market_key: 'ft_result', outcome: '1', odds: 2.2, unix: 2, bookmaker_slug: 'pinnacle', datetime: '2026-11-22T10:01:00Z' },
    { fixture_id: 101, market_key: 'ft_result', outcome: 'draw', odds: 3.2, unix: 2, bookmaker_id: 47 },
    { fixture_id: 101, market_key: 'ft_result', outcome: 'away', odds: 3.5, unix: 2, bookmaker_id: 2 },
    { fixture_id: 101, market_key: 'btts', outcome: 'yes', odds: 1.8, unix: 2, bookmaker_id: 1 },
  ],
  [
    { fixture_id: 101, market_id: 6, outcome: 'home', opening: 2.0, closing: 2.2, peak: 2.4, bookmaker_id: 47 },
    { fixture_id: 101, market_id: 6, outcome: 'draw', opening: 3.1, closing: 3.2, peak: 3.4, bookmaker_id: 47 },
    { fixture_id: 101, market_id: 6, outcome: 'away', opening: 3.6, closing: 3.5, peak: 3.8, bookmaker_id: 47 },
    { fixture_id: 101, market_id: 9, outcome: 'home', opening: 1.9, closing: 2.0, peak: 2.1, bookmaker_id: 47 },
    { fixture_id: 101, market_id: 6, outcome: 'home', opening: 2.2, closing: 2.3, peak: 2.5, bookmaker_id: 2 },
  ],
  6,
  47,
);

if (result.length !== 2) throw new Error('Matched fixtures should be emitted even when no Pinnacle price is available.');
if (result[0].current.home !== 2.2) throw new Error('The latest Pinnacle FT home price was not selected.');
if (result[0].current.draw !== 3.2) throw new Error('Pinnacle draw price was not normalized.');
if (result[0].current.away !== null) throw new Error('Non-Pinnacle or non-FT prices must not be used.');
if (result[0].opening.home !== 2 || result[0].closing.home !== 2.2 || result[0].peak.home !== 2.4) {
  throw new Error('Pinnacle opening, closing and peak history was not mapped.');
}
if (result[0].latestPriceAt !== '2026-11-22T10:01:00Z') {
  throw new Error('Latest price timestamp was not retained.');
}
if (result[1].oddAlertsFixtureId !== 102 || result[1].current.home !== null) {
  throw new Error('Fixtures without Pinnacle rows should retain their mapping and show no quote.');
}

console.log('Pinnacle full-time prices and historical line mapping passed.');
