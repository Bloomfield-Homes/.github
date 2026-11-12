// "/laurel trim" moves the acceptance criteria Laurel's latest check found met out of the issue's
// "Acceptance criteria" section into an "Already done" section at the end. No model runs. The issue's edit
// history keeps the old body, so a trim can be undone by hand.

const MARKER = /<!-- laurel:check ([a-z]+)(?: met=([\d,]+))? -->/;
const HEADING = /^\s*(#{1,6}\s*|\*\*)?acceptance criteria\b/i;
const SECTION_END = /^\s*#{1,6}\s/;
const BULLET = /^\s*(?:[-*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/;

/** The newest check by `bot`, as {verdict, met, url}, or null. Other authors are ignored. */
function latestCheck(comments, bot) {
  for (const comment of [...comments].reverse()) {
    if (!comment.user || comment.user.login !== bot) continue;
    const m = (comment.body || '').match(MARKER);
    if (!m) continue;
    const met = m[2] ? m[2].split(',').filter(Boolean).map(Number) : [];
    return { verdict: m[1], met, url: comment.html_url };
  }
  return null;
}

/**
 * The body with criteria `met` (1-based, in listed order) moved to an "Already done" section.
 * Returns {body, moved, left}; `moved` is empty when nothing matched, and the body is then unchanged.
 */
function trimBody(body, met, ref) {
  const lines = (body || '').split(/\r?\n/);
  const start = lines.findIndex((l) => HEADING.test(l));
  if (start < 0) return { body, moved: [], left: 0 };
  let end = lines.findIndex((l, i) => i > start && SECTION_END.test(l));
  if (end < 0) end = lines.length;

  const want = new Set(met);
  const moved = [];
  let index = 0;
  let left = 0;
  const kept = lines.slice(start + 1, end).filter((l) => {
    const bullet = l.match(BULLET);
    if (!bullet) return true;
    index += 1;
    if (!want.has(index)) {
      left += 1;
      return true;
    }
    moved.push(bullet[1].trim());
    return false;
  });
  if (moved.length === 0) return { body, moved, left };

  const done = ['', '## Already done', '', `Laurel's [check](${ref}) found these met, so they left the criteria above.`, '',
    ...moved.map((c) => `- [x] ${c}`)];
  const out = [...lines.slice(0, start + 1), ...kept, ...lines.slice(end)];
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return { body: [...out, ...done, ''].join('\n'), moved, left };
}

module.exports = { latestCheck, trimBody };
