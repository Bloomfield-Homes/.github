const test = require('node:test');
const assert = require('node:assert/strict');
const { recentAttempts, capComment } = require('./attempts');

const now = Date.parse('2026-11-21T12:00:00Z');
const run = (id, over = {}) => ({
  id, display_title: 'Show roles', conclusion: 'success', created_at: '2026-11-21T10:00:00Z', ...over,
});

test('counts earlier runs on the same title within the last day', () => {
  const runs = [run(1), run(2, { conclusion: 'failure' }), run(3, { conclusion: null })];
  assert.equal(recentAttempts(runs, { title: 'Show roles', selfId: 99, now }), 3);
});

test('skips this run, skipped runs, other titles and runs older than a day', () => {
  const runs = [
    run(99),
    run(1, { conclusion: 'skipped' }),
    run(2, { display_title: 'Other issue' }),
    run(3, { created_at: '2026-11-20T11:59:59Z' }),
    run(4, { created_at: '2026-11-20T12:00:00Z' }),
  ];
  assert.equal(recentAttempts(runs, { title: 'Show roles', selfId: 99, now }), 1);
});

test('the cap comment names the count, the limit and the input that raises it', () => {
  const text = capComment(7, 6);
  for (const part of ['7 times', 'limit is 6', '`max_runs_per_day`']) assert.ok(text.includes(part), part);
});
