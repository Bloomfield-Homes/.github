// Laurel's comment when sizing returns no usable estimate. "Too broad" stays with real oversize estimates.

const CAUSES = {
  timeout: 'the gateway did not answer within 4 minutes, on both attempts',
  network: 'the call to the gateway failed before it answered',
  length: "the sizing model's reply ran past its length cap without finishing",
  not_json: "the sizing model's reply was not valid JSON",
  empty: 'the sizing model returned an estimate with no files or no changed lines',
};

function sizingFailureMessage(cause, runUrl) {
  let why = CAUSES[cause] || 'the sizing step failed before it returned an answer';
  if (cause === 'http 429') why = 'the gateway refused the call because Laurel had too many requests in flight';
  else if (/^http \d+$/.test(cause || '')) why = `the gateway returned HTTP ${cause.slice(5)}`;
  return `**Laurel could not size this issue:** ${why}. This is a problem on Laurel's side, not a sign the ` +
    `issue is too broad.\n\n**Next:** remove and re-add the \`laurel\` label to retry.\n\n[Run log](${runUrl})`;
}

module.exports = { sizingFailureMessage };
