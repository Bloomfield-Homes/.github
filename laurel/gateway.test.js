const test = require('node:test');
const assert = require('node:assert/strict');
const { chatJSON, chatJSONResult, BACKOFF_MS } = require('./gateway');

const quiet = { warning() {}, info() {} };
const base = { url: 'http://gw', key: 'k', model: 'm', system: 's', prompt: 'p', schema: {}, log: quiet, sleepImpl: async () => {} };
const answer = (content, finishReason = 'stop') => async () => ({
  ok: true,
  json: async () => ({ model: 'm', choices: [{ finish_reason: finishReason, message: { content } }], usage: {} }),
});

test('returns the parsed reply', async () => {
  assert.deepEqual(await chatJSON({ ...base, fetchImpl: answer('{"a":1}') }), { a: 1 });
});

test('sends the token cap it is given', async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    return answer('{"a":1}')();
  };
  await chatJSON({ ...base, maxTokens: 2000, fetchImpl });
  assert.equal(sent.max_tokens, 2000);
});

test('names a timeout', async () => {
  const fetchImpl = async () => {
    const e = new Error('The operation was aborted due to timeout');
    e.name = 'TimeoutError';
    throw e;
  };
  assert.deepEqual(await chatJSONResult({ ...base, fetchImpl }), { reply: null, cause: 'timeout' });
});

test('names a refused call by its status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429 });
  assert.equal((await chatJSONResult({ ...base, fetchImpl })).cause, 'http 429');
});

test('names a reply cut off at the token cap', async () => {
  assert.equal((await chatJSONResult({ ...base, fetchImpl: answer('{"a":', 'length') })).cause, 'length');
});

test('names a finished reply that is not JSON', async () => {
  assert.equal((await chatJSONResult({ ...base, fetchImpl: answer('sure, here it is') })).cause, 'not_json');
});

test('logs the first 500 characters of a reply that is not JSON', async () => {
  const lines = [];
  const log = { warning() {}, info: (m) => lines.push(m) };
  await chatJSONResult({ ...base, log, fetchImpl: answer('x'.repeat(600), 'length') });
  assert.ok(lines.includes(`Reply starts: "${'x'.repeat(500)}"`));
});


test('waits out a dropped connection, such as a gateway restart', async () => {
  const waits = [];
  let calls = 0;
  const fetchImpl = async (...args) => {
    calls += 1;
    if (calls < 3) throw new TypeError('fetch failed');
    return answer('{"a":1}')(...args);
  };
  const out = await chatJSONResult({ ...base, fetchImpl, sleepImpl: async (ms) => { waits.push(ms); } });
  assert.deepEqual(out, { reply: { a: 1 } });
  assert.deepEqual(waits, [BACKOFF_MS[0], BACKOFF_MS[1]]);
});

test('stops retrying when the step budget runs out', async () => {
  let clock = 0;
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    clock += 4 * 60 * 1000;
    const e = new Error('The operation was aborted due to timeout');
    e.name = 'TimeoutError';
    throw e;
  };
  const out = await chatJSONResult({
    ...base, fetchImpl, now: () => clock, sleepImpl: async (ms) => { clock += ms; },
  });
  assert.deepEqual(out, { reply: null, cause: 'timeout' });
  assert.equal(calls, 2);
});