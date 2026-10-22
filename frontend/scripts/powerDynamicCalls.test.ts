/**
 * Power-dynamic call catalogue.
 * Run: npx tsx scripts/powerDynamicCalls.test.ts
 */
import { POWER_DYNAMIC_CALLS, powerDynamicCall, powerDynamicFunction } from '../utils/powerDynamicCalls';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed += 1;
    console.log(`  ok ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const ids = POWER_DYNAMIC_CALLS.map((item) => item.id);
check('every power dynamic id is unique', new Set(ids).size === ids.length);
check('baseline can be called by one function', powerDynamicFunction('baseline', 'gap')?.label === 'Gap analysis');
check('last 5 keeps its separate reads', powerDynamicCall('last5')?.functions.length === 8);
check('a missing call stays empty', powerDynamicCall('call') == null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
