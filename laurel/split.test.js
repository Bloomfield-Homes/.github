const test = require('node:test');
const assert = require('node:assert/strict');
const { splitMarker, latestSplit, partBody, openSplit } = require('./split');

const BOT = 'bloomfield-laurel[bot]';
const split = [
  { title: 'Graph token --> and presence API', acceptance_criteria: ['Token obtained', 'Errors return nil'] },
  { title: 'Poll job', acceptance_criteria: ['Polls every 60s', 'Broadcasts changes only'] },
];
const comment = (login, body) => ({ user: { login }, body });

test('a marker round-trips the split, even with a title that would close an HTML comment', () => {
  const marker = splitMarker(split);
  assert.ok(marker.startsWith('<!-- laurel:split ') && marker.endsWith(' -->'), marker);
  assert.equal(marker.indexOf('-->'), marker.length - 3);
  assert.deepEqual(latestSplit([comment(BOT, `Too broad.\n\n${marker}`)], BOT), split);
});

test('parts without a title are dropped and missing criteria become empty', () => {
  const marker = splitMarker([{ title: '  ' }, { title: 'Only part' }]);
  assert.deepEqual(latestSplit([comment(BOT, marker)], BOT), [{ title: 'Only part', acceptance_criteria: [] }]);
});

test('the newest bot comment wins, and other authors are ignored', () => {
  const older = splitMarker([{ title: 'Old', acceptance_criteria: [] }]);
  const newer = splitMarker([{ title: 'New', acceptance_criteria: [] }]);
  const forged = splitMarker([{ title: 'Forged', acceptance_criteria: [] }]);
  const comments = [comment(BOT, older), comment(BOT, newer), comment('someone', forged)];
  assert.equal(latestSplit(comments, BOT)[0].title, 'New');
});

test('a damaged marker falls back to an older one, and no marker gives null', () => {
  const good = splitMarker([{ title: 'Good', acceptance_criteria: [] }]);
  const comments = [comment(BOT, good), comment(BOT, '<!-- laurel:split bm90IGpzb24= -->')];
  assert.equal(latestSplit(comments, BOT)[0].title, 'Good');
  assert.equal(latestSplit([comment(BOT, 'no marker here')], BOT), null);
});

test('a part body names its parent and lists the criteria Laurel needs to start', () => {
  assert.equal(
    partBody(split[1], 1, 2, 339),
    'Part 2 of 2, split from #339.\n\n## Acceptance criteria\n\n- [ ] Polls every 60s\n- [ ] Broadcasts changes only\n',
  );
});

test('openSplit opens each part and links it as a sub-issue of the parent, in order', async () => {
  const calls = [];
  let next = 0;
  const github = {
    rest: {
      issues: {
        create: async (args) => {
          calls.push(['create', args.title]);
          next += 1;
          return { data: { id: 9000 + next, number: 400 + next } };
        },
      },
    },
    request: async (route, args) => calls.push(['link', route, args.issue_number, args.sub_issue_id]),
  };
  const opened = await openSplit({ github, owner: 'o', repo: 'r', parent: 339, parts: split });
  assert.deepEqual(opened, [401, 402]);
  assert.deepEqual(calls, [
    ['create', split[0].title],
    ['link', 'POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', 339, 9001],
    ['create', split[1].title],
    ['link', 'POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', 339, 9002],
  ]);
});
