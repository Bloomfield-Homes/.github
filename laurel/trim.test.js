const test = require('node:test');
const assert = require('node:assert/strict');
const { latestCheck, trimBody } = require('./trim');
const { checkMarker } = require('./check');

const BOT = 'bloomfield-laurel[bot]';
const comment = (login, body, url = 'https://x/c') => ({ user: { login }, body, html_url: url });
const BODY = [
  'Intro.',
  '',
  '## Acceptance criteria',
  '',
  '- [ ] Version matches',
  '- Banner shows',
  '- [ ] Linux documented',
  '',
  '## Notes',
  'Keep me.',
].join('\n');

test('latestCheck reads the newest bot check and ignores forged ones from people', () => {
  const comments = [
    comment(BOT, checkMarker('partly', [1]), 'old'),
    comment(BOT, checkMarker('partly', [1, 2]), 'new'),
    comment('someone', checkMarker('done')),
  ];
  assert.deepEqual(latestCheck(comments, BOT), { verdict: 'partly', met: [1, 2], url: 'new' });
  assert.deepEqual(latestCheck([comment(BOT, checkMarker('valid'))], BOT), { verdict: 'valid', met: [], url: 'https://x/c' });
  assert.equal(latestCheck([comment('someone', checkMarker('partly', [1]))], BOT), null);
});

test('trimBody moves met criteria to Already done and keeps every other section', () => {
  const { body, moved, left } = trimBody(BODY, [1, 2], 'https://x/c');
  assert.deepEqual(moved, ['Version matches', 'Banner shows']);
  assert.equal(left, 1);
  assert.match(body, /## Acceptance criteria\n\n- \[ \] Linux documented\n\n## Notes\nKeep me\.\n\n## Already done/);
  assert.match(body, /- \[x\] Version matches\n- \[x\] Banner shows\n$/);
  assert.match(body, /\[check\]\(https:\/\/x\/c\)/);
});

test('trimBody leaves the body alone when nothing matches or there is no criteria section', () => {
  for (const [body, met] of [[BODY, [9]], ['No criteria here.\n- a\n- b', [1]], [BODY, []]]) {
    const out = trimBody(body, met, 'r');
    assert.equal(out.body, body);
    assert.deepEqual(out.moved, []);
  }
});

test('a criteria section that runs to the end of the body still trims', () => {
  const { body, left } = trimBody('**Acceptance criteria**\n1. One\n2. Two\n3. Three', [2], 'r');
  assert.equal(left, 2);
  assert.match(body, /^\*\*Acceptance criteria\*\*\n1\. One\n3\. Three\n\n## Already done/);
});
