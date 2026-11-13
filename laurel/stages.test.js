const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const s = require('./stages');
const { chatJSON, ATTEMPTS } = require('./gateway');

const issue = { number: 7, title: 'Add a badge', body: '## Acceptance criteria\n- a\n- b' };
const quiet = { info() {}, warning() {} };

test('an edited issue gets a new revision', () => {
  assert.equal(s.issueRev('body'), s.issueRev('  body  '));
  assert.notEqual(s.issueRev('body'), s.issueRev('body, edited'));
});

test('findStage returns the newest matching comment for the revision only', () => {
  const rev = s.issueRev(issue.body);
  const comments = [
    { body: s.stageComment('plan', rev, 'Laurel plan', 'first plan') },
    { body: s.stageComment('plan', 'oldrev', 'Laurel plan', 'stale plan') },
    { body: s.stageComment('plan', rev, 'Laurel plan', 'second plan') },
    { body: 'an ordinary comment' },
  ];
  assert.equal(s.findStage(comments, 'plan', rev), 'second plan');
  assert.equal(s.findStage(comments, 'review', rev), null);
  assert.equal(s.findStage(comments.slice(1, 2), 'plan', rev), null);
});

test('resultText reads the final answer and tolerates a missing file', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'laurel-')), 'exec.json');
  fs.writeFileSync(file, JSON.stringify([{ type: 'assistant' }, { type: 'result', result: '  ## Files\nx  ' }]));
  assert.equal(s.resultText(file), '## Files\nx');
  assert.equal(s.resultText(path.join(os.tmpdir(), 'missing-laurel.json')), '');
});

test('blockedReason finds a BLOCKED line anywhere in the answer', () => {
  assert.equal(s.blockedReason('Looked around.\nBLOCKED: needs Lots-front-end'), 'needs Lots-front-end');
  assert.equal(s.blockedReason('## Files\napp.scss'), null);
});

test('doneReason finds a DONE line, and only plan and build offer it', () => {
  assert.equal(s.doneReason('Checked.\nDONE: app_spec.rb already asserts it'), 'app_spec.rb already asserts it');
  assert.equal(s.doneReason('## Files\napp.scss'), null);
  assert.ok(s.planPrompt({ issue, files: 'a.rb' }).includes(s.DONE_RULE));
  assert.ok(s.buildPrompt({ issue, plan: 'PLAN' }).includes(s.DONE_RULE));
  assert.ok(!s.fixPrompt({ issue, plan: 'PLAN', review: 'R' }).includes(s.DONE_RULE));
  assert.match(s.doneComment('x'), /close this issue/);
});

test('each prompt carries the issue, and later stages carry the plan', () => {
  for (const p of [s.planPrompt({ issue, files: 'a.rb' }), s.buildPrompt({ issue, plan: 'PLAN' }),
    s.fixPrompt({ issue, plan: 'PLAN', review: 'REVIEW' }), s.reviewPrompt({ issue, plan: 'PLAN', diff: 'DIFF' })]) {
    assert.match(p, /Issue #7: Add a badge/);
    assert.match(p, /## Acceptance criteria/);
  }
  assert.match(s.buildPrompt({ issue, plan: 'PLAN' }), /PLAN/);
  assert.match(s.fixPrompt({ issue, plan: 'PLAN', review: 'REVIEW' }), /REVIEW/);
});

test('the review prompt clips a huge diff', () => {
  const p = s.reviewPrompt({ issue, plan: 'p', diff: 'x'.repeat(70000) });
  assert.match(p, /\[diff truncated\]/);
  assert.ok(p.length < 65000);
});

test('needsFix is true for blockers and for unmet or partial criteria only', () => {
  const met = { criterion: 'a', status: 'met', evidence: 'e' };
  const unverifiable = { criterion: 'b', status: 'unverifiable', evidence: 'browser' };
  assert.equal(s.needsFix({ criteria: [met, unverifiable], blockers: [] }), false);
  assert.equal(s.needsFix({ criteria: [met, { ...met, status: 'partial' }], blockers: [] }), true);
  assert.equal(s.needsFix({ criteria: [met], blockers: ['bug'] }), true);
});

test('formatReview renders a table and the blockers', () => {
  const md = s.formatReview({ criteria: [{ criterion: 'a', status: 'met', evidence: 'line 3' }], blockers: ['bug'] });
  assert.match(md, /\| a \| met \| line 3 \|/);
  assert.match(md, /- bug/);
});

test('chatJSON retries a failed attempt and returns the parsed reply', async () => {
  const replies = [new Error('fetch failed'), { choices: [{ message: { content: '```json\n{"ok":true}\n```' } }] }];
  let calls = 0;
  const fetchImpl = async () => {
    const r = replies[calls++];
    if (r instanceof Error) throw r;
    return { ok: true, json: async () => r };
  };
  const out = await chatJSON({ url: 'http://gw/', key: 'k', model: 'm', system: 's', prompt: 'p', schema: {}, log: quiet, fetchImpl });
  assert.deepEqual(out, { ok: true });
  assert.equal(calls, 2);
});

test('chatJSON gives up after its attempts', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: false, status: 503 }; };
  const out = await chatJSON({ url: 'http://gw', key: 'k', model: 'm', system: 's', prompt: 'p', schema: {}, log: quiet, fetchImpl });
  assert.equal(out, null);
  assert.equal(calls, ATTEMPTS);
});
