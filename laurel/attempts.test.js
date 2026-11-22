const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { STARTED_STEP, candidateRuns, startedRun, capComment } = require('./attempts');

const now = Date.parse('2026-11-21T12:00:00Z');
const run = (id, over = {}) => ({
  id, display_title: 'Show roles', conclusion: 'success', created_at: '2026-11-21T10:00:00Z', ...over,
});

test('keeps earlier runs on the same title within the last day', () => {
  const runs = [run(1), run(2, { conclusion: 'failure' }), run(3, { conclusion: null })];
  assert.deepEqual(candidateRuns(runs, { title: 'Show roles', selfId: 99, now }).map((r) => r.id), [1, 2, 3]);
});

test('drops this run, skipped runs, other titles and runs older than a day', () => {
  const runs = [
    run(99),
    run(1, { conclusion: 'skipped' }),
    run(2, { display_title: 'Other issue' }),
    run(3, { created_at: '2026-11-20T11:59:59Z' }),
    run(4, { created_at: '2026-11-20T12:00:00Z' }),
  ];
  assert.deepEqual(candidateRuns(runs, { title: 'Show roles', selfId: 99, now }).map((r) => r.id), [4]);
});

test('a run counts only when it reached the started step', () => {
  const step = (name, conclusion) => ({ name, conclusion });
  assert.equal(startedRun([{ steps: [step('Cap runs per day', 'success'), step(STARTED_STEP, 'success')] }]), true);
  assert.equal(startedRun([{ steps: [step('Cap runs per day', 'success'), step(STARTED_STEP, 'skipped')] }]), false);
  assert.equal(startedRun([{ steps: [] }, {}]), false);
  assert.equal(startedRun([]), false);
});

test('the workflow has the started step the cap counts', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'laurel.yml'), 'utf8');
  assert.ok(yml.includes(`      - name: ${STARTED_STEP}\n`));
});

test('the cap comment names the count, the limit and the input that raises it', () => {
  const text = capComment(7, 6);
  for (const part of ['7 times', 'limit is 6', '`max_runs_per_day`']) assert.ok(text.includes(part), part);
});
