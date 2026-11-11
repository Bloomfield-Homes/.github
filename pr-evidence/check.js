// PR evidence: a PR that changes user-visible or export files must show screenshots or link an example file.
// Rules live in each calling repo's CLAUDE.md, "PR evidence". Loaded by .github/workflows/pr-evidence.yml.

const COMMENT = /<!--[\s\S]*?-->/g;
const IMAGE = /!\[[^\]]*\]\([^)\s]+[^)]*\)|<img\s[^>]*src=/i;
const LINK = /(^|[^!])\[[^\]]+\]\([^)\s]+[^)]*\)|<a\s[^>]*href=/im;
const NO_UI_CHANGE = /^\s*`?No UI change\.`?\s*$/im;

/** Text under a `## <heading>` line, up to the next `## ` heading. Empty when absent. */
function section(body, heading) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

function bullets(files) {
  return files.map((f) => `- ${f}`).join('\n');
}

/**
 * One message per missing piece of evidence; empty when the PR passes.
 * files: changed paths still in the PR. Patterns are JS regex source; an empty export pattern matches nothing.
 */
function evidenceProblems({ body, files, uiPattern, exportPattern }) {
  const text = (body || '').replace(COMMENT, '');
  const ui = new RegExp(uiPattern);
  const exp = exportPattern ? new RegExp(exportPattern) : null;
  const uiFiles = files.filter((f) => ui.test(f));
  const exportFiles = exp ? files.filter((f) => exp.test(f)) : [];
  const problems = [];

  if (uiFiles.length && !NO_UI_CHANGE.test(text) && !IMAGE.test(section(text, 'Screenshots'))) {
    problems.push(
      'This PR changes user-visible files but has no image under "## Screenshots" and no "No UI change." line:\n' +
        bullets(uiFiles),
    );
  }
  if (exportFiles.length && !LINK.test(section(text, 'Example files'))) {
    problems.push(
      'This PR changes export files but links no example file under "## Example files":\n' + bullets(exportFiles),
    );
  }
  return problems;
}

module.exports = { section, evidenceProblems };
