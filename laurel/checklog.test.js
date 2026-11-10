const test = require('node:test');
const assert = require('node:assert/strict');
const { findRunRefs, failureExcerpt, checkLogContext } = require('./checklog');

const quiet = { warning() {} };
const jobUrl = 'https://github.com/Org/app/actions/runs/42/job/7';

function fakeGithub({ jobs = [], logs = {}, failLog = false } = {}) {
  const calls = [];
  const actions = {
    getJobForWorkflowRun: async ({ job_id }) => {
      calls.push(['job', job_id]);
      return { data: jobs.find((j) => j.id === job_id) };
    },
    listJobsForWorkflowRun: async ({ run_id }) => {
      calls.push(['jobs', run_id]);
      return { data: { jobs } };
    },
    downloadJobLogsForWorkflowRun: async ({ job_id }) => {
      calls.push(['log', job_id]);
      if (failLog) throw new Error('Not Found');
      return { data: logs[job_id] };
    },
  };
  return { calls, rest: { actions } };
}

test('finds the run and job ids in every Actions URL, each once', () => {
  const body = `/laurel fix "test (shard 2)": ${jobUrl} and ${jobUrl} and https://github.com/Org/app/actions/runs/43`;
  assert.deepEqual(findRunRefs(body), [
    { owner: 'Org', repo: 'app', runId: 42, jobId: 7 },
    { owner: 'Org', repo: 'app', runId: 43, jobId: null },
  ]);
});

test('finds no runs in a comment without an Actions URL', () => {
  assert.deepEqual(findRunRefs('/laurel please fix the tests'), []);
});

test('keeps failure lines and the three after them, without timestamps or colour codes', () => {
  const log = [
    '2026-11-10T18:00:00.0000000Z setup ok',
    '2026-11-10T18:00:01.0000000Z \x1b[31m FAIL \x1b[39m src/a.test.ts > adds',
    '2026-11-10T18:00:02.0000000Z AssertionError: expected 1 to be 2',
    '2026-11-10T18:00:03.0000000Z  ❯ src/a.test.ts:24:21',
    '2026-11-10T18:00:04.0000000Z next',
    '2026-11-10T18:00:05.0000000Z after one',
    '2026-11-10T18:00:06.0000000Z after two',
    '2026-11-10T18:00:07.0000000Z dropped',
  ].join('\n');
  const expected = [
    ' FAIL  src/a.test.ts > adds',
    'AssertionError: expected 1 to be 2',
    ' ❯ src/a.test.ts:24:21',
    'next',
    'after one',
    'after two',
  ];
  assert.equal(failureExcerpt(log), expected.join('\n'));
});

test('caps the excerpt at 150 lines', () => {
  const log = Array.from({ length: 400 }, (_, i) => `FAIL case ${i}`).join('\n');
  assert.equal(failureExcerpt(log).split('\n').length, 150);
});

test('gives an empty excerpt for a log with no failure lines', () => {
  assert.equal(failureExcerpt('all good\nstill good'), '');
});

test('reads the linked job log and names the job, matching the repo case-insensitively', async () => {
  const jobs = [{ id: 7, name: 'test (shard 2)', conclusion: 'failure' }];
  const github = fakeGithub({ jobs, logs: { 7: 'FAIL src/a.test.ts' } });
  const text = await checkLogContext({ github, owner: 'org', repo: 'APP', body: jobUrl, log: quiet });
  assert.match(text, /## test \(shard 2\) \(job 7\)/);
  assert.match(text, /FAIL src\/a\.test\.ts/);
});

test('reads only the failed jobs of a linked run', async () => {
  const jobs = [{ id: 1, name: 'lint', conclusion: 'success' }, { id: 2, name: 'test', conclusion: 'failure' }];
  const github = fakeGithub({ jobs, logs: { 2: 'FAIL x' } });
  const body = 'https://github.com/Org/app/actions/runs/43';
  await checkLogContext({ github, owner: 'Org', repo: 'app', body, log: quiet });
  assert.deepEqual(github.calls, [['jobs', 43], ['log', 2]]);
});

test('ignores runs in other repositories', async () => {
  const github = fakeGithub();
  const body = 'https://github.com/Other/repo/actions/runs/9';
  const text = await checkLogContext({ github, owner: 'Org', repo: 'app', body, log: quiet });
  assert.equal(text, '');
  assert.deepEqual(github.calls, []);
});

test('warns and returns empty text when a log cannot be read', async () => {
  const warnings = [];
  const github = fakeGithub({ jobs: [{ id: 7, name: 't', conclusion: 'failure' }], failLog: true });
  const log = { warning: (m) => warnings.push(m) };
  const text = await checkLogContext({ github, owner: 'Org', repo: 'app', body: jobUrl, log });
  assert.equal(text, '');
  assert.equal(warnings.length, 1);
});

test('reads a log that arrives as an ArrayBuffer', async () => {
  const logs = { 7: new TextEncoder().encode('FAIL binary').buffer };
  const github = fakeGithub({ jobs: [{ id: 7, name: 't', conclusion: 'failure' }], logs });
  const text = await checkLogContext({ github, owner: 'Org', repo: 'app', body: jobUrl, log: quiet });
  assert.match(text, /FAIL binary/);
});
