// The PR evidence block. Laurel writes it to .laurel/evidence.md and the workflow puts it in the PR description,
// where the repo's evidence job reads it and captures screenshots on the Lots stack.

const BLOCK = /<!--\s*evidence[ \t]*\r?\n[\s\S]*?-->/;
const SECTION = '## Screenshots';

/** The first well-formed evidence block in `text`, or ''. A block with a directive-free body is not one. */
function evidenceBlock(text) {
  const match = String(text || '').match(BLOCK);
  if (!match) return '';
  const lines = match[0].split(/\r?\n/).slice(1, -1).map((l) => l.trim()).filter(Boolean);
  return lines.some((l) => /^(page|download):\s*\/\S*/.test(l)) ? match[0] : '';
}

/**
 * `body` with `block` in it: replaces an existing block in place, or appends a Screenshots section.
 * Everything else in the description is kept. Returns `body` unchanged when there is no block.
 */
function mergeEvidence(body, block) {
  const text = String(body || '');
  if (!block) return text;
  if (BLOCK.test(text)) return text.replace(BLOCK, () => block);
  const gap = text.trim() ? '\n\n' : '';
  return `${text.trimEnd()}${gap}${SECTION}\n\n${block}\nCaptured by CI from this block.`;
}

module.exports = { evidenceBlock, mergeEvidence };
