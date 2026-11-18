const test = require('node:test');
const assert = require('node:assert/strict');
const { scrubPushTalk } = require('./tidy');

test('drops a blocked-push sentence and keeps the rest of the paragraph', () => {
  const body = 'Fixed both review comments. The code is committed but the push to origin is blocked by permission controls.';
  assert.equal(scrubPushTalk(body), 'Fixed both review comments.');
});

test('keeps the bullet and the sentences that do not narrate a push', () => {
  const body = "## Still needed\n- **Push**: The local commit hasn't been pushed to origin (push command requires permission approval). Once pushed, CI should re-run.";
  assert.equal(scrubPushTalk(body), '## Still needed\n- Once pushed, CI should re-run.');
});

test('drops a line that is only push talk, and an emptied paragraph', () => {
  assert.equal(scrubPushTalk('Summary here.\n\nI cannot push to the remote.'), 'Summary here.');
});

test('drops push and PR checklist items', () => {
  const body = '- [x] Fix the bug\n- [ ] Push the branch\n- [x] Open a pull request';
  assert.equal(scrubPushTalk(body), '- [x] Fix the bug');
});

test('leaves unrelated text alone', () => {
  const body = '## Summary\n\nConverted `//` comments to JSX comments.\n\n## Files\n- `NavItems.tsx`';
  assert.equal(scrubPushTalk(body), body);
});