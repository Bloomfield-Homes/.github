const test = require('node:test');
const assert = require('node:assert/strict');
const { sizingFailureMessage } = require('./sizing');

const run = 'https://github.com/o/r/actions/runs/1';

for (const [cause, phrase] of [
  ['timeout', 'did not answer within 4 minutes'],
  ['network', 'failed before it answered'],
  ['http 429', 'too many requests in flight'],
  ['http 502', 'returned HTTP 502'],
  ['length', 'ran past its length cap'],
  ['not_json', 'was not valid JSON'],
  ['empty', 'no files or no changed lines'],
  [undefined, 'failed before it returned an answer'],
]) {
  test(`names the cause for ${cause}, says how to retry, and does not blame the issue`, () => {
    const message = sizingFailureMessage(cause, run);
    assert.ok(message.includes(phrase), message);
    assert.ok(message.includes('comment `/laurel retry`'), message);
    assert.ok(message.endsWith('<!-- laurel:retry -->'), message);
    assert.ok(message.includes(`[Run log](${run})`), message);
    assert.ok(!message.includes('too broad for one PR'), message);
  });
}
