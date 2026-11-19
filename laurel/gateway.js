// One JSON chat completion through the LLM gateway, for Laurel's single-call steps (sizing, review).

const ATTEMPTS = 4;

// Waits before attempts 2, 3 and 4. A gateway deploy or restart drops calls for a minute or two, so a
// quick failure waits it out instead of failing the step.
const BACKOFF_MS = [15 * 1000, 45 * 1000, 90 * 1000];

// Node's fetch gives up after 5 minutes without headers, so one attempt waits at most 4.
const ATTEMPT_MS = 4 * 60 * 1000;

// Every attempt and wait fits inside the 10-minute step that calls this.
const BUDGET_MS = 9 * 60 * 1000;

// An attempt with less time than this left is not worth starting.
const MIN_ATTEMPT_MS = 30 * 1000;

// Enough of a reply that is not JSON to show why, without dumping all of it.
const LOGGED_CHARS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseContent(data) {
  const content = data.choices[0].message.content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(content);
}

/** { reply } on success, else { cause }: timeout, network, http <status>, length or not_json. */
async function request({ url, key, model, system, prompt, schema, maxTokens, log, fetchImpl, attemptMs }) {
  let data;
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(attemptMs),
      body: JSON.stringify({
        model,
        temperature: 0,
        // Reasoning counts against this cap on the cloud tier.
        max_tokens: maxTokens,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'reply', schema } },
      }),
    });
    if (!res.ok) {
      log.warning(`Gateway returned ${res.status}`);
      return { cause: `http ${res.status}` };
    }
    data = await res.json();
  } catch (e) {
    log.warning(`Gateway request failed: ${e.message}${e.cause ? ` (${e.cause.code || e.cause.name})` : ''}`);
    return { cause: e.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
  try {
    return { reply: parseContent(data) };
  } catch (e) {
    const choice = data.choices?.[0];
    const content = choice?.message?.content || '';
    log.warning(
      `Reply was not JSON: model=${data.model}, finish_reason=${choice?.finish_reason}, ` +
        `content_length=${content.length}, completion_tokens=${data.usage?.completion_tokens}`,
    );
    log.info(`Reply starts: ${JSON.stringify(content.slice(0, LOGGED_CHARS))}`);
    return { cause: choice?.finish_reason === 'length' ? 'length' : 'not_json' };
  }
}

/** { reply } from the first good attempt, else { reply: null, cause } from the last. Every failure is retried
 * after a wait, while the step's time budget allows. */
async function chatJSONResult({
  url, key, model, system, prompt, schema, maxTokens = 16000, log = console, fetchImpl = fetch,
  sleepImpl = sleep, now = Date.now,
}) {
  const deadline = now() + BUDGET_MS;
  let cause;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      const wait = BACKOFF_MS[attempt - 2];
      if (deadline - now() - wait < MIN_ATTEMPT_MS) break;
      log.info(`Retrying in ${wait / 1000} s`);
      await sleepImpl(wait);
    }
    const attemptMs = Math.min(ATTEMPT_MS, deadline - now());
    const result = await request({ url, key, model, system, prompt, schema, maxTokens, log, fetchImpl, attemptMs });
    if (result.reply) return result;
    cause = result.cause;
    log.info(`Attempt ${attempt} of ${ATTEMPTS} failed: ${cause}`);
  }
  return { reply: null, cause };
}

/** The parsed JSON reply, or null after every attempt failed. */
async function chatJSON(options) {
  return (await chatJSONResult(options)).reply;
}

module.exports = { chatJSON, chatJSONResult, ATTEMPTS, BACKOFF_MS };