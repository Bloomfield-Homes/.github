// Laurel's proposed split of an oversize issue. The size comment carries it in a hidden marker, so a
// "/laurel split" comment (or a client button that posts one) can open the parts as sub-issues.

const MARKER = /<!-- laurel:split ([A-Za-z0-9+/=]+) -->/;

/** The hidden marker for a split. Base64, so a title cannot close the HTML comment early. */
function splitMarker(split) {
  const parts = split
    .map((s) => ({
      title: String(s.title || '').trim(),
      acceptance_criteria: (s.acceptance_criteria || []).map(String),
    }))
    .filter((s) => s.title);
  return `<!-- laurel:split ${Buffer.from(JSON.stringify(parts)).toString('base64')} -->`;
}

/** The split in the newest comment by `bot` that carries one, or null. Other authors are ignored. */
function latestSplit(comments, bot) {
  for (const comment of [...comments].reverse()) {
    if (!comment.user || comment.user.login !== bot) continue;
    const match = (comment.body || '').match(MARKER);
    if (!match) continue;
    try {
      const parts = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
      if (Array.isArray(parts) && parts.length > 0) return parts;
    } catch (e) {
      // A damaged marker is skipped in favour of an older one.
    }
  }
  return null;
}

/** The body of part `index` (zero-based) of `count`, split from issue #`parent`. */
function partBody(part, index, count, parent) {
  const criteria = part.acceptance_criteria.map((c) => `- [ ] ${c}`).join('\n');
  return `Part ${index + 1} of ${count}, split from #${parent}.\n\n## Acceptance criteria\n\n${criteria}\n`;
}

/** Opens each part as an issue linked as a sub-issue of `parent`. Returns the new issue numbers. */
async function openSplit({ github, owner, repo, parent, parts }) {
  const opened = [];
  for (const [index, part] of parts.entries()) {
    const { data: issue } = await github.rest.issues.create({
      owner, repo, title: part.title, body: partBody(part, index, parts.length, parent),
    });
    await github.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
      owner, repo, issue_number: parent, sub_issue_id: issue.id,
    });
    opened.push(issue.number);
  }
  return opened;
}

module.exports = { splitMarker, latestSplit, partBody, openSplit };
