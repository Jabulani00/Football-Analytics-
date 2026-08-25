/**
 * Unit tests for utils/competitionZones.
 * Run: npx tsx scripts/competitionZones.test.ts
 *
 * The rules the old code got wrong: zones must be per-competition, relegation
 * must survive a league changing size, and an unknown competition must show
 * nothing rather than a guess.
 */
import { zonesForCompetition, COMPETITION_ZONES } from '../utils/competitionZones';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const at = (id: number, total: number) =>
  zonesForCompetition(id, total).map((z) => `${z.afterPos}:${z.label}`);

console.log('Premier League (comp 423, 20 teams)');
{
  const z = at(423, 20);
  check('four dividers', z.length === 4, z.join(' | '));
  check('Champions League under 4th', z[0] === '4:Champions League', z[0]);
  check('Europa League under 5th', z[1] === '5:Europa League', z[1]);
  check('Conference under 6th', z[2] === '6:Conference League qualifying', z[2]);
  check('Relegation above the bottom three', z[3] === '17:Relegation', z[3]);
}

console.log('Bundesliga (comp 477, 18 teams) — has a relegation play-off');
{
  const z = at(477, 18);
  check('play-off line above 16th', z.includes('15:Relegation play-off'), z.join(' | '));
  check('relegation line above 17th', z.includes('16:Relegation'), z.join(' | '));
}

console.log('Ligue 1 (comp 200, 18 teams) — 4th is a qualifying round');
{
  const z = at(200, 18);
  check('Champions League under 3rd', z[0] === '3:Champions League', z[0]);
  check('qualifying under 4th', z[1] === '4:Champions League qualifying', z[1]);
}

console.log('Relegation is anchored to the bottom, so it survives a resize');
{
  // Same rules, a league that grew by two teams.
  check('20-team table relegates from 18th', at(423, 20).includes('17:Relegation'));
  check('22-team table relegates from 20th', at(423, 22).includes('19:Relegation'), at(423, 22).join(' | '));
  check('18-team table relegates from 16th', at(423, 18).includes('15:Relegation'), at(423, 18).join(' | '));
}

console.log('Scottish Premiership (comp 259, 12 teams)');
{
  const z = at(259, 12);
  check('Champions League under 1st', z[0] === '1:Champions League', z[0]);
  check('CL qualifying under 2nd', z[1] === '2:Champions League qualifying', z[1]);
  check('Conference qualifying under 3rd', z[2] === '3:Conference League qualifying', z[2]);
  check('play-off line above 11th', z.includes('10:Relegation play-off'), z.join(' | '));
  check('relegation line above 12th', z.includes('11:Relegation'), z.join(' | '));
  // The Scottish Cup winner's Europa place has no league position to sit on.
  check('no Europa divider is invented', !z.some((x) => /Europa/.test(x)), z.join(' | '));
}

console.log('South Africa Premier League (comp 26, 16 teams) — CAF, not UEFA');
{
  const z = at(26, 16);
  check('CAF Champions League under 2nd', z[0] === '2:CAF Champions League', z[0]);
  check('play-off line above 15th', z.includes('14:Promotion / relegation play-off'), z.join(' | '));
  check('relegation line above 16th', z.includes('15:Relegation'), z.join(' | '));
  check('no UEFA competition named', !z.some((x) => /Europa|Conference|(^|[^F])Champions League/.test(x.replace('CAF Champions League', ''))),
    z.join(' | '));
  // The Nedbank Cup winner's Confederation Cup place is not a league position.
  check('no Confederation Cup divider is invented', !z.some((x) => /Confederation/.test(x)), z.join(' | '));
}

console.log('Unknown or missing competitions show no zones at all');
{
  check('unknown id', zonesForCompetition(999999, 20).length === 0);
  check('null id', zonesForCompetition(null, 20).length === 0);
  check('undefined id', zonesForCompetition(undefined, 20).length === 0);
  check('mock string id', zonesForCompetition('spl', 12).length === 0);
  check('empty table', zonesForCompetition(423, 0).length === 0);
}

console.log('Lines never fall outside the table or collide');
{
  for (const id of Object.keys(COMPETITION_ZONES).map(Number)) {
    for (const total of [1, 2, 4, 6, 8, 10, 18, 20, 24]) {
      const z = zonesForCompetition(id, total);
      const bad = z.filter((x) => x.afterPos < 1 || x.afterPos >= total);
      check(`comp ${id} @ ${total} teams: all lines inside the table`, bad.length === 0,
        JSON.stringify(bad));
      const positions = z.map((x) => x.afterPos);
      check(`comp ${id} @ ${total} teams: no duplicate lines`,
        new Set(positions).size === positions.length, JSON.stringify(positions));
    }
  }
}

console.log('Accepts a string id, since ids arrive from route params');
{
  check('string "423" resolves', zonesForCompetition('423', 20).length === 4);
}

console.log(failures === 0 ? '\nAll checks passed ✅' : `\n${failures} check(s) failed ❌`);
process.exit(failures === 0 ? 0 : 1);
