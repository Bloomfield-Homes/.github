const test = require('node:test');
const assert = require('node:assert/strict');
const { section, evidenceProblems } = require('./check');

const API = { uiPattern: '^app/views/', exportPattern: '^app/(views/pdfs/|controllers/api/exports/)' };
const FE = {
  uiPattern: String.raw`^src/(?!.*(\.test\.|\.spec\.|\.stories\.|/__tests__/|/tests/)).*\.(tsx|jsx|css|scss)$`,
  exportPattern: String.raw`^src/(?!.*(\.test\.|\.spec\.|/__tests__/|/tests/))(.*/)?[^/]*(Export|Pdf|Csv|Xlsx|export|pdf|csv|xlsx)[^/]*\.tsx?$`,
};
const VIEW = 'app/views/layouts/mailer.html.erb';
const PDF = 'app/views/pdfs/reports/sales_summary_by_cm.html.erb';
const IMG = '![after: report page 1](https://github.com/user-attachments/assets/abc)';
const FILE_LINK = '- [sales_summary_by_cm.pdf](https://github.com/user-attachments/files/1/sales_summary_by_cm.pdf)';

function body(sections) {
  return Object.entries(sections)
    .map(([heading, text]) => `## ${heading}\n\n${text}`)
    .join('\n\n');
}

test('section returns the text up to the next heading', () => {
  assert.equal(section('## A\none\n## B\ntwo', 'a').trim(), 'one');
  assert.equal(section('## A\none', 'B'), '');
});

test('passes a PR that touches no UI or export files', () => {
  assert.deepEqual(evidenceProblems({ ...API, body: '', files: ['app/models/lot.rb'] }), []);
});

test('flags a UI change with no screenshot and names the files', () => {
  const problems = evidenceProblems({ ...API, body: body({ Screenshots: 'TODO' }), files: [VIEW] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /## Screenshots/);
  assert.match(problems[0], /- app\/views\/layouts\/mailer\.html\.erb/);
});

test('accepts a No UI change line in place of screenshots', () => {
  for (const line of ['No UI change.', '`No UI change.`']) {
    assert.deepEqual(evidenceProblems({ ...API, body: line, files: [VIEW] }), [], line);
  }
});

test('ignores the template hints inside an HTML comment', () => {
  const hint = '## Screenshots\n\n<!--\nNo UI change.\n![x](y)\n-->';
  assert.equal(evidenceProblems({ ...API, body: hint, files: [VIEW] }).length, 1);
});

test('requires the image under Screenshots, not under another heading', () => {
  const misplaced = body({ Screenshots: 'Rendered locally.', 'Example files': `${FILE_LINK}\n\n${IMG}` });
  const problems = evidenceProblems({ ...API, body: misplaced, files: [PDF] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /## Screenshots/);
});

test('flags an export change whose Example files holds only text or an image', () => {
  for (const examples of ['Synthetic example PDF to be attached.', IMG]) {
    const problems = evidenceProblems({ ...API, body: body({ Screenshots: IMG, 'Example files': examples }), files: [PDF] });
    assert.equal(problems.length, 1, examples);
    assert.match(problems[0], /## Example files/);
  }
});

test('passes an export change with a screenshot and a linked example file', () => {
  const full = body({ Screenshots: IMG, 'Example files': FILE_LINK });
  assert.deepEqual(evidenceProblems({ ...API, body: full, files: [PDF] }), []);
});

test('an empty export pattern matches nothing', () => {
  assert.deepEqual(
    evidenceProblems({ uiPattern: '^src/', exportPattern: '', body: 'No UI change.', files: ['src/a.tsx'] }),
    [],
  );
});

test('front-end patterns skip tests and catch export modules', () => {
  const cases = [
    ['src/components/reports/exec/salesSummaryByCM/useSalesSummaryByCMExport.ts', false, true],
    ['src/components/reports/exec/archives/PdfPreviewDialog.tsx', true, true],
    ['src/components/MainNav/NavItems.tsx', true, false],
    ['src/components/MainNav/tests/NavItems.test.tsx', false, false],
    ['src/components/Table/__tests__/exports.test.ts', false, false],
    ['src/utils/api.ts', false, false],
  ];
  for (const [file, isUi, isExport] of cases) {
    assert.equal(new RegExp(FE.uiPattern).test(file), isUi, `${file} ui`);
    assert.equal(new RegExp(FE.exportPattern).test(file), isExport, `${file} export`);
  }
});
