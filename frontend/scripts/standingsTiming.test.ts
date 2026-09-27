/**
 * Unit tests for the goal-timing metrics in utils/standingsAnalytics.
 * Run: npx tsx scripts/standingsTiming.test.ts
 *
 * Covers the rule that matters: a goal's minute is not in a final score, so
 * these metrics are answered by the provider's recorded timings or reported
 * unavailable. Nothing is ever estimated into the ranking.
 */
import { buildStandingsView, type TeamTiming } from '../utils/standingsAnalytics';
import type { StandingRow } from '../mock/matchData';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const row = (team: string, played: number, gf: number, ga: number): StandingRow => ({
  pos: 0, team, played, won: 0, drawn: played, lost: 0,
  gf, ga, gd: gf - ga, points: played, form: [],
});

const timed = (o: Partial<TeamTiming>): TeamTiming => ({
  firstGoalFor: null, firstGoalAgainst: null,
  scoredIn15: { count: 0, pct: 0 }, concededIn15: { count: 0, pct: 0 },
  scoredAfter70: { count: 0, pct: 0 }, concededAfter70: { count: 0, pct: 0 },
  coveragePct: 100, ...o,
});

const base = [row('Early', 10, 20, 5), row('Late', 10, 8, 18), row('Mid', 10, 12, 12)];
const cell = (v: ReturnType<typeof buildStandingsView>, team: string) => v.metric!.values.get(team)!;

console.log('Recorded timings drive the first-goal metrics');
{
  const timing = new Map<string, TeamTiming>([
    ['Early', timed({ firstGoalFor: 21.4, scoredIn15: { count: 4, pct: 40 } })],
    ['Mid',   timed({ firstGoalFor: 38.0, scoredIn15: { count: 2, pct: 20 } })],
    ['Late',  timed({ firstGoalFor: 55.2, scoredIn15: { count: 1, pct: 10 } })],
  ]);
  const v = buildStandingsView(base, { kind: 'prob', metric: 'early1h', period: 'ft' }, { timing });
  check('ranks earliest first', v.rows.map((r) => r.team).join(',') === 'Early,Mid,Late',
    v.rows.map((r) => r.team).join(','));
  check('shows the recorded minute', cell(v, 'Early').display === "21.4'", cell(v, 'Early').display);
  check('shows the recorded window %', cell(v, 'Early').sub === "40% scored by 15'", cell(v, 'Early').sub);
  check('flags the source as measured', v.timingSource === 'measured', String(v.timingSource));
  check('caption says recorded', v.caption.includes('recorded timings'), v.caption);
}

console.log('Late-goal metrics use the recorded rate, not a minute');
{
  const timing = new Map<string, TeamTiming>([
    ['Early', timed({ scoredAfter70: { count: 2, pct: 20 } })],
    ['Mid',   timed({ scoredAfter70: { count: 6, pct: 60 } })],
    ['Late',  timed({ scoredAfter70: { count: 4, pct: 40 } })],
  ]);
  const v = buildStandingsView(base, { kind: 'prob', metric: 'late', period: 'ft' }, { timing });
  check('ranks highest rate first', v.rows.map((r) => r.team).join(',') === 'Mid,Late,Early',
    v.rows.map((r) => r.team).join(','));
  check('headline is a percentage', cell(v, 'Mid').display === '60%', cell(v, 'Mid').display);
  check('sub counts matches', cell(v, 'Mid').sub === '6 of 10', cell(v, 'Mid').sub);
}

console.log('A team with no recorded value is shown as unknown, never estimated into the ranking');
{
  const timing = new Map<string, TeamTiming>([
    ['Early', timed({ firstGoalFor: 30 })],
    ['Mid', timed({ firstGoalFor: null })],
    ['Late', timed({ firstGoalFor: null })],
  ]);
  const v = buildStandingsView(base, { kind: 'prob', metric: 'early1h', period: 'ft' }, { timing });
  const displays = v.rows.map((r) => cell(v, r.team).display);

  check('no row reports minute 0', !displays.includes("0.0'"), JSON.stringify(displays));
  check('unknown rows render as a dash', displays.filter((d) => d === '—').length === 2, JSON.stringify(displays));
  // The bug this guards: an invented minute ranked against recorded ones.
  check('no estimated value appears in a measured column',
    v.rows.every((r) => !cell(v, r.team).sub.includes('est.')),
    v.rows.map((r) => cell(v, r.team).sub).join(' | '));
  check('the measured team ranks first', v.rows[0].team === 'Early', v.rows[0].team);
  check('unknown rows sort last', displays[displays.length - 1] === '—', JSON.stringify(displays));
  check('source is partial', v.timingSource === 'partial', String(v.timingSource));
  check('caption counts the gap, not an estimate',
    v.caption.includes('recorded timings') && v.caption.includes('2 without a value yet'), v.caption);
}

console.log('No estimate is ever mixed into a measured column');
{
  // One team measured, the rest not: the others read "—", never a guess.
  for (const metric of ['early1h', 'earlyConc', 'late', 'early2h'] as const) {
    const timing = new Map<string, TeamTiming>([
      ['Early', timed({ firstGoalFor: 12, firstGoalAgainst: 12, scoredAfter70: { count: 1, pct: 10 }, concededAfter70: { count: 1, pct: 10 } })],
    ]);
    const v = buildStandingsView(base, { kind: 'prob', metric, period: 'ft' }, { timing });
    const subs = v.rows.map((r) => cell(v, r.team).sub);
    check(`${metric}: nothing is marked as an estimate`, !subs.some((x) => x.includes('est.')), subs.join(' | '));
    check(`${metric}: the measured team leads`, v.rows[0].team === 'Early', v.rows[0].team);
    check(
      `${metric}: the rest read as a dash`,
      v.rows.slice(1).every((r) => cell(v, r.team).display === '—'),
      v.rows.slice(1).map((r) => cell(v, r.team).display).join(' | '),
    );
  }
}

console.log('Thin samples report the sample size instead of a meaningless rate');
{
  const thin = [row('A', 1, 3, 0), row('B', 1, 1, 1)];
  const timing = new Map<string, TeamTiming>([
    ['A', timed({ firstGoalFor: 9, scoredIn15: { count: 1, pct: 100 } })],
    ['B', timed({ firstGoalFor: 40, scoredIn15: { count: 0, pct: 0 } })],
  ]);
  const v = buildStandingsView(thin, { kind: 'prob', metric: 'early1h', period: 'ft' }, { timing });
  check('sub reports the sample', cell(v, 'A').sub === 'from 1 match', cell(v, 'A').sub);
  check('no 100% claim off one match', !cell(v, 'A').sub.includes('100%'), cell(v, 'A').sub);
  check('caption flags thin samples', v.caption.includes('under 3 matches'), v.caption);

  const deep = [row('C', 10, 20, 5)];
  const deepTiming = new Map<string, TeamTiming>([['C', timed({ firstGoalFor: 22, scoredIn15: { count: 4, pct: 40 } })]]);
  const v2 = buildStandingsView(deep, { kind: 'prob', metric: 'early1h', period: 'ft' }, { timing: deepTiming });
  check('a full sample still shows the rate', cell(v2, 'C').sub === "40% scored by 15'", cell(v2, 'C').sub);
  check('caption does not flag a full sample', !v2.caption.includes('under 3 matches'), v2.caption);
}

console.log('Without recorded timings the metric is unavailable, not invented');
{
  const v = buildStandingsView(base, { kind: 'prob', metric: 'early1h', period: 'ft' });
  check('source is unavailable', v.timingSource === 'unavailable', String(v.timingSource));
  check('caption says there are no recorded timings',
    v.caption.includes('no recorded timings'), v.caption);
  check('every row reads as a dash',
    v.rows.every((r) => cell(v, r.team).display === '—'),
    v.rows.map((r) => cell(v, r.team).display).join(' | '));
  check('the note explains why', !!v.note && v.note.includes('recorded timings'), String(v.note));
}

console.log('Column shape is fixed per metric — a minute or a rate, never both');
{
  const timing = new Map<string, TeamTiming>(
    base.map((r) => [r.team, timed({ firstGoalFor: 30, firstGoalAgainst: 30, scoredAfter70: { count: 3, pct: 30 }, concededAfter70: { count: 3, pct: 30 } })]),
  );
  for (const [metric, suffix] of [['early1h', "'"], ['earlyConc', "'"], ['late', '%'], ['early2h', '%']] as const) {
    const v = buildStandingsView(base, { kind: 'prob', metric, period: 'ft' }, { timing });
    check(
      `${metric} always ends with "${suffix}"`,
      v.rows.every((r) => cell(v, r.team).display.endsWith(suffix)),
      cell(v, base[0].team).display,
    );
  }
}

console.log('Half views have nothing to read — recorded timing covers the whole match');
{
  const timing = new Map<string, TeamTiming>([['Early', timed({ firstGoalFor: 21.4 })]]);
  const v = buildStandingsView(base, { kind: 'prob', metric: 'early1h', period: '1h' }, { timing });
  check('1st-half view is unavailable', v.timingSource === 'unavailable', String(v.timingSource));
  check('no minute is invented for the half',
    v.rows.every((r) => cell(v, r.team).display === '—'),
    v.rows.map((r) => cell(v, r.team).display).join(' | '));
}

console.log(failures === 0 ? '\nAll checks passed ✅' : `\n${failures} check(s) failed ❌`);
process.exit(failures === 0 ? 0 : 1);
