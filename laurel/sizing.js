// Laurel's size limit, and its comment when sizing returns no usable estimate. "Too broad" stays with real
// oversize estimates.

// A change fits in 10 files and 300 lines. A small change (100 lines or fewer) may touch up to 20 files,
// since the same small edit repeated across many views is still one easy review.
const LIMIT = { files: 10, lines: 300, wideFiles: 20, wideLines: 100 };
const LIMIT_TEXT = `${LIMIT.files} files and ${LIMIT.lines} lines, or up to ${LIMIT.wideFiles} files ` +
  `when the change is ${LIMIT.wideLines} lines or fewer`;

function withinLimit(files, lines) {
  if (lines > LIMIT.lines) return false;
  return files <= LIMIT.files || (files <= LIMIT.wideFiles && lines <= LIMIT.wideLines);
}

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
    `issue is too broad.\n\n**Next:** comment \`/laurel retry\`.\n\n[Run log](${runUrl})\n\n<!-- laurel:retry -->`;
}

module.exports = { LIMIT, LIMIT_TEXT, withinLimit, sizingFailureMessage };
