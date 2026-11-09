// One JSON chat completion through the LLM gateway, for Laurel's single-call steps (sizing, review).

const ATTEMPTS = 2;

// Node's fetch gives up after 5 minutes without headers, so two 4-minute attempts fit a 10-minute step.
const ATTEMPT_MS = 4 * 60 * 1000;

function parseContent(data) {
  const content = data.choices[0].message.content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(content);
}

async function request({ url, key, model, system, prompt, schema, maxTokens, log, fetchImpl }) {
  let data;
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(ATTEMPT_MS),
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
      return null;
    }
    data = await res.json();
  } catch (e) {
    log.warning(`Gateway request failed: ${e.message}${e.cause ? ` (${e.cause.code || e.cause.name})` : ''}`);
    return null;
  }
  try {
    return parseContent(data);
  } catch (e) {
    const choice = data.choices?.[0];
    log.warning(
      `Reply was not JSON: model=${data.model}, finish_reason=${choice?.finish_reason}, ` +
        `content_length=${(choice?.message?.content || '').length}, completion_tokens=${data.usage?.completion_tokens}`,
    );
    return null;
  }
}

/** The parsed JSON reply, or null after ATTEMPTS failed tries. A truncated reply or a stalled gateway is retried. */
async function chatJSON({ url, key, model, system, prompt, schema, maxTokens = 16000, log = console, fetchImpl = fetch }) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const reply = await request({ url, key, model, system, prompt, schema, maxTokens, log, fetchImpl });
    if (reply) return reply;
    log.info(`Attempt ${attempt} of ${ATTEMPTS} failed`);
  }
  return null;
}

module.exports = { chatJSON, ATTEMPTS };
