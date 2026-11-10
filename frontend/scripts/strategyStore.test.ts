/**
 * Strategy cloud store — the pure DB-row → SavedStrategy mapper.
 * Proves a builder_strategy row maps to the app's saved shape, recomputing the
 * auto description, carrying the user's note, and defaulting a malformed config.
 */
import { rowToSaved, type BuilderStrategyRow } from '../services/strategyStore';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed += 1; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed += 1; }
}

const base: BuilderStrategyRow = {
  id: 'abc-123',
  name: 'Away goal suppressors',
  note: 'Use before away underdog matches',
  config: { conditions: [], logic: 'or', resultMode: 'fixtures' },
  owner_key: 'device-1',
  created_at: '2026-11-09T10:00:00.000Z',
  updated_at: '2026-11-09T10:00:00.000Z',
};

{
  const s = rowToSaved(base);
  check('id carries through', s.id === 'abc-123', s.id);
  check('name carries through', s.name === 'Away goal suppressors');
  check('user note carries through', s.note === 'Use before away underdog matches');
  check('createdAt comes from created_at', s.createdAt === '2026-11-09T10:00:00.000Z');
  check('logic/resultMode preserved', s.config.logic === 'or' && s.config.resultMode === 'fixtures');
  check('description is auto-rebuilt for fixtures', s.description.startsWith('Fixtures'), s.description);
}
{
  const s = rowToSaved({ ...base, note: null });
  check('null note becomes undefined', s.note === undefined);
}
{
  // Malformed config falls back to safe defaults rather than crashing.
  const s = rowToSaved({ ...base, config: {} as BuilderStrategyRow['config'] });
  check('missing conditions default to []', Array.isArray(s.config.conditions) && s.config.conditions.length === 0);
  check('missing logic defaults to and', s.config.logic === 'and');
  check('missing resultMode defaults to teams', s.config.resultMode === 'teams');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} strategy-store checks failed`);
