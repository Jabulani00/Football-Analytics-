import fs from 'node:fs';
import path from 'node:path';

import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

type CompactTestResult = {
  title: string;
  status: string;
  durationMs: number;
  annotations: { type: string; description?: string }[];
  error?: string;
};

class CompactReporter implements Reporter {
  private readonly startedAt = new Date();
  private readonly tests: CompactTestResult[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    this.tests.push({
      title: test.titlePath().filter(Boolean).join(' › '),
      status: result.status,
      durationMs: result.duration,
      annotations: test.annotations.map(({ type, description }) => ({ type, description })),
      ...(result.error?.message
        ? { error: result.error.message.split('\n').slice(0, 3).join('\n') }
        : {}),
    });
  }

  onEnd(result: FullResult) {
    const counts = this.tests.reduce<Record<string, number>>((totals, item) => {
      totals[item.status] = (totals[item.status] ?? 0) + 1;
      return totals;
    }, {});
    const report = {
      generatedAt: new Date().toISOString(),
      startedAt: this.startedAt.toISOString(),
      overallStatus: result.status,
      counts,
      tests: this.tests,
    };
    const folder = path.resolve('e2e-results');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(
      `\nCompact report: ${path.join(folder, 'summary.json')} (${JSON.stringify(counts)})\n`,
    );
  }
}

export default CompactReporter;
