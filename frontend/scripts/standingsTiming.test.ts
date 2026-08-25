/**
 * Unit tests for the goal-timing metrics in utils/standingsAnalytics.
 * Run: npx tsx scripts/standingsTiming.test.ts
 *
 * Covers the split that matters: recorded timings from the provider are used
 * verbatim, and the estimate only stands in where none exist — without the
 * column changing shape between the two.
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

console.log('Measured and estimated values never share one column');
{
  // One team measured, the rest not: the column must stay wholly measured.
  for (const metric of ['early1h', 'earlyConc', 'late', 'early2h'] as const) {
    const timing = new Map<string, TeamTiming>([
      ['Early', timed({ firstGoalFor: 12, firstGoalAgainst: 12, scoredAfter70: { count: 1, pct: 10 }, concededAfter70: { count: 1, pct: 10 } })],
    ]);
    const v = buildStandingsView(base, { kind: 'prob', metric, period: 'ft' }, { timing });
    const subs = v.rows.map((r) => cell(v, r.team).sub);
    const mixed = subs.some((x) => x.includes('est.')) && subs.some((x) => !x.includes('est.') && x !== 'not yet');
    check(`${metric}: column is not mixed`, !mixed, subs.join(' | '));
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

console.log('Without recorded timings the estimate stands in, and says so');
{
  const v = buildStandingsView(base, { kind: 'prob', metric: 'early1h', period: 'ft' });
  check('source is estimated', v.timingSource === 'estimated', String(v.timingSource));
  check('caption admits the estimate', v.caption.includes('estimated'), v.caption);
  check('sub is marked est.', cell(v, 'Early').sub.endsWith('est.'), cell(v, 'Early').sub);
}

console.log('Column shape does not change with the data source');
{
  const timing = new Map<string, TeamTiming>(
    base.map((r) => [r.team, timed({ firstGoalFor: 30, scoredAfter70: { count: 3, pct: 30 } })]),
  );
  for (const [metric, suffix] of [['early1h', "'"], ['earlyConc', "'"], ['late', '%'], ['early2h', '%']] as const) {
    const real = buildStandingsView(base, { kind: 'prob', metric, period: 'ft' }, { timing });
    const est = buildStandingsView(base, { kind: 'prob', metric, period: 'ft' });
    const realOk = real.rows.every((r) => {
      const d = cell(real, r.team).display;
      return d === '—' || d.endsWith(suffix);
    });
    const estOk = est.rows.every((r) => cell(est, r.team).display.endsWith(suffix));
    check(`${metric} ends with "${suffix}" either way`, realOk && estOk,
      `measured=${cell(real, base[0].team).display} estimated=${cell(est, base[0].team).display}`);
  }
}

console.log('Half views keep the estimate — recorded timing covers the whole match');
{
  const timing = new Map<string, TeamTiming>([['Early', timed({ firstGoalFor: 21.4 })]]);
  const v = buildStandingsView(base, { kind: 'prob', metric: 'early1h', period: '1h' }, { timing });
  check('1st-half view is estimated', v.timingSource === 'estimated', String(v.timingSource));
  const mins = v.rows.map((r) => parseInt(cell(v, r.team).display));
  check('minutes stay inside the half', mins.every((m) => m >= 1 && m <= 45), JSON.stringify(mins));
}

console.log(failures === 0 ? '\nAll checks passed ✅' : `\n${failures} check(s) failed ❌`);
process.exit(failures === 0 ? 0 : 1);
