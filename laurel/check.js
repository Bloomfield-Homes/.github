// "/laurel check" asks Laurel whether an issue still needs doing. Laurel reads the code and history, never
// edits, and posts a verdict comment ending in <!-- laurel:check <verdict> [met=1,3] --> so a client can
// show it. `met` lists the acceptance criteria already met, by position, for "/laurel trim".

const VERDICTS = {
  valid: { label: 'Still needed', next: 'Nothing in the code meets it yet.' },
  partly: { label: 'Partly done', next: 'Comment `/laurel trim` to move the met criteria out of the issue.' },
  done: { label: 'Already done', next: 'Consider closing it as completed.' },
  obsolete: { label: 'No longer applies', next: 'Consider closing it as not planned.' },
  unclear: { label: 'Cannot tell from the code', next: 'A person needs to check what the code cannot show.' },
};

const VERDICT_LINE = /^[\s*_>#-]*verdict[\s*_]*:[\s*_]*([a-z]+)/im;
const MET_LINE = /^[\s*_>#-]*met[\s*_]*:[\s*_]*([^\n]*)/im;
const MAX_LIST = 40;
const MAX_COMMENT = 2000;
const MAX_CRITERION = 50;

/** The hidden marker a client reads. It holds only a known word and digits, so it cannot break out. */
const checkMarker = (verdict, met = []) =>
  `<!-- laurel:check ${verdict}${met.length ? ` met=${met.join(',')}` : ''} -->`;

/** The verdict word from the agent's final reply, or null when it gave none we know. */
function parseVerdict(text) {
  const word = (text || '').match(VERDICT_LINE)?.[1]?.toLowerCase();
  return word && Object.hasOwn(VERDICTS, word) ? word : null;
}

/** Criterion numbers from the reply's "Met:" line, sorted and unique. "none" or no line gives []. */
function parseMet(text) {
  const line = (text || '').match(MET_LINE)?.[1] || '';
  const nums = (line.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= MAX_CRITERION);
  return [...new Set(nums)].sort((a, b) => a - b);
}

const STRUCTURED = /^\s*(#|\*\*|[-*] |\d+\. )/;

/**
 * The reply without its verdict line or any HTML comment, so issue text cannot forge a Laurel marker.
 * Plain lines before the first heading, bold label or list item are the model narrating its work, and go.
 */
function cleanReply(text) {
  const lines = (text || '')
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .split('\n')
    .filter((line) => !VERDICT_LINE.test(line) && !MET_LINE.test(line));
  const start = lines.findIndex((line) => STRUCTURED.test(line));
  return lines.slice(Math.max(start, 0)).join('\n').trim();
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function checkPrompt({ issue, comments = [], linked = [], merged = [] }) {
  const people = comments
    .filter((c) => c.user && c.user.type === 'User')
    .slice(-MAX_LIST)
    .map((c) => `- ${c.user.login}, ${c.created_at}: ${clip((c.body || '').trim(), MAX_COMMENT)}`);
  const prs = (list) => list.slice(0, MAX_LIST).map((p) => `- #${p.number} ${p.title} (${p.state}${p.merged_at ? ', merged' : ''})`);
  return [
    `Issue #${issue.number}: ${issue.title}`,
    `Opened ${issue.created_at}.`,
    '',
    issue.body || '(no description)',
    '',
    '## Comments from people',
    people.length ? people.join('\n') : 'None.',
    '',
    '## Pull requests that mention this issue',
    linked.length ? prs(linked).join('\n') : 'None.',
    '',
    '## Pull requests merged since the issue opened',
    merged.length ? prs(merged).join('\n') : 'None.',
    '',
    'Decide whether this issue still needs doing in this repository as it stands today. Read the code and use',
    '`git log` and `git show` for history since the issue opened. Check each acceptance criterion, or the',
    'described problem when there are none. Do not edit, commit or push. Do not try to run the app.',
    '',
    'Reply in exactly this shape and nothing else:',
    'Verdict: valid | partly | done | obsolete | unclear',
    'Met: the numbers of the acceptance criteria already met, counting from 1 in the order listed, or none',
    '## Evidence',
    '- one line per criterion: met, not met or cannot tell, with a file path or commit or PR as proof',
    '## Next',
    'one sentence on what a person should do',
    '',
    'valid means nothing meets it yet. partly means some criteria are met. done means all are met.',
    'obsolete means the code or feature it is about is gone or was replaced. unclear means the answer needs',
    'a running app, real data or another repository.',
  ].join('\n');
}

/** The comment Laurel posts. A reply with no known verdict is reported as unclear. */
function checkComment(text) {
  const verdict = parseVerdict(text) || 'unclear';
  const met = verdict === 'partly' ? parseMet(text) : [];
  const { label } = VERDICTS[verdict];
  const next = verdict === 'partly' && met.length === 0
    ? 'Laurel did not say which criteria are met, so there is nothing to trim.'
    : VERDICTS[verdict].next;
  const reply = cleanReply(text) || 'Laurel gave no reasoning. Comment `/laurel check` to try again.';
  return [
    `**Laurel check: ${label}.** ${next}`,
    '',
    reply,
    '',
    'Laurel only read the code. It changed nothing and leaves closing the issue to you.',
    '',
    checkMarker(verdict, met),
  ].join('\n');
}

module.exports = { VERDICTS, checkMarker, parseVerdict, parseMet, cleanReply, checkPrompt, checkComment };
