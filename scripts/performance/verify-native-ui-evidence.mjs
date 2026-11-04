// Recompute statistics and check saved evidence; this does not render or benchmark.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';

const directory = resolve(process.argv[2] ?? 'docs/performance/checkpoints/main-native-ui-window-02');
const read = async name => JSON.parse(await readFile(join(directory, name), 'utf8'));
const report = await read('benchmark.json');
const supervision = await read('window-02.supervision.json');
const prepared = await readFile(join(directory, 'prepared.json'));
assert.equal(createHash('sha256').update(prepared).digest('hex'), 'ee5bc1b66d04fa232d08db9d09a60504f531261a870ccacb8366186bdff31054');
assert.deepEqual(report.binding, JSON.parse(prepared));
assert.equal(report.binding.mainCommit, '8a15a6f11187eea3cc968fae9a064a38be7e71de');
assert.equal(report.binding.driverCommit, 'f45b4f4f300bcae50b79f316a3fb1939dfe33d4f');
assert.deepEqual(report.binding.patches, ['8afbb506ef09116465288d8d4821078cfd1028ec', '8821ec05eca3ba0d75408d3a703a5fdfe392b44b']);
assert.equal(report.allPassed, true);
assert.equal(supervision.exitCode, 0);
assert.equal(supervision.timedOut, false);
assert.ok(supervision.elapsedSeconds < 180);
assert.equal(report.cohorts.length, 8);
const statistics = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  assert.equal(n, 12);
  return {n, medianMs: (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    ownerUpperMedianMs: sorted[n / 2], p95Ms: sorted[Math.ceil(n * .95) - 1]};
};
const summary = {};
for (const [index, width] of [1920, 3840].entries()) {
  const cohorts = report.cohorts.filter(c => c.width === width);
  assert.deepEqual(cohorts.map(c => c.mode), ['control', 'candidate', 'candidate', 'control']);
  const reference = cohorts[0].verification;
  assert.deepEqual(reference.map(v => v.frame), [0, 3, 6]);
  for (const cohort of cohorts) {
    const saved = await read(`case-${index}-${cohort.cohort}-${cohort.mode}.json`);
    const {cohort: ignored, ...withoutIndex} = cohort;
    assert.deepEqual(saved, withoutIndex);
    assert.equal(cohort.closed, true);
    assert.equal(cohort.allPassed, true);
    assert.equal(cohort.bitmap.pending, 0);
    assert.equal(cohort.bitmap.received, cohort.bitmap.closed);
    assert.deepEqual(cohort.verification, reference);
    assert.equal(new Set(cohort.rows.filter(r => r.kind === 'unique-new-frame').map(r => r.frame)).size, 6);
    for (const row of cohort.rows) {
      assert.equal(row.visibility, 'visible');
      assert.equal(row.sourceGpu.core.backendInfo.isFallbackAdapter, false);
      assert.equal(row.sourceGpu.scope.readbackBytes, 0);
      assert.equal(row.sourceGpu.scope.failed, false);
    }
  }
  summary[width] = {};
  for (const mode of ['control', 'candidate']) {
    const selected = cohorts.filter(c => c.mode === mode);
    const rows = selected.flatMap(c => c.rows).filter(r => r.kind === 'unique-new-frame');
    const stats = statistics(rows.map(r => r.readyMs));
    assert.equal(stats.ownerUpperMedianMs, report.summary[width][mode].uiReady.medianMs);
    assert.equal(stats.p95Ms, report.summary[width][mode].uiReady.p95Ms);
    summary[width][mode] = {uiReady: stats, twoRaf: statistics(rows.map(r => r.twoRafFenceMs)),
      nodeControl: statistics(rows.map(r => r.nodeControlWallMs)), coldSessionMs: selected.map(c => c.sessionColdMs)};
  }
  summary[width].medianReductionPercent = 100 * (1 - summary[width].candidate.uiReady.medianMs / summary[width].control.uiReady.medianMs);
}
const result = {verified: true, sourceBaseline: report.binding.mainCommit,
  driverCommit: report.binding.driverCommit, patches: report.binding.patches, summary,
  cohorts: 8, timedNewFrames: 48, rgbaRecords: 24, crossCohortRgbaComparisons: 18,
  elapsedSeconds: supervision.elapsedSeconds,
  environment: report.environment,
  qualification: 'One Windows hardware GPU workload, preview UI status completion. Two rAF is a paint proxy, not physical scanout. Driver asserts downstream GPU and zero Vault leases; these are not separately stored per row. No final export or GPU execution-time claim. Candidate patches remain unmerged.',
  medianConvention: 'Arithmetic mean of the two central samples; original owner upper median is retained separately. Nearest-rank P95 equals maximum for n=12.'};
if (process.argv[3]) await writeFile(resolve(process.argv[3]), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
