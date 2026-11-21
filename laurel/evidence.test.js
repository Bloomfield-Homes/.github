const test = require('node:test');
const assert = require('node:assert/strict');
const { evidenceBlock, mergeEvidence } = require('./evidence');

const block = '<!-- evidence\npage: / | User menu\nexpect: Admin\n-->';

test('a block with a page or download directive is returned as written', () => {
  assert.equal(evidenceBlock(`Notes first.\n\n${block}\n`), block);
  assert.equal(evidenceBlock('<!-- evidence\ndownload: /lots/1/report | Export\n-->'),
    '<!-- evidence\ndownload: /lots/1/report | Export\n-->');
});

test('text with no block, or a block with no page or download line, gives nothing', () => {
  for (const text of ['', 'just prose', '<!-- evidence\nexpect: Admin\n-->', '<!-- evidence\npage: no-slash\n-->']) {
    assert.equal(evidenceBlock(text), '', text);
  }
});

test('an existing block is replaced in place and the rest of the description is kept', () => {
  const body = 'Closes #5\n\n## Screenshots\n\n<!-- evidence\npage: /old\n-->\nCaptured by CI.\n\n## Notes\nkeep me';
  const merged = mergeEvidence(body, block);
  assert.equal(merged, `Closes #5\n\n## Screenshots\n\n${block}\nCaptured by CI.\n\n## Notes\nkeep me`);
});

test('a description without a block gets a Screenshots section appended', () => {
  assert.equal(mergeEvidence('Closes #5', block), `Closes #5\n\n## Screenshots\n\n${block}\nCaptured by CI from this block.`);
  assert.equal(mergeEvidence('', block), `## Screenshots\n\n${block}\nCaptured by CI from this block.`);
});

test('a replacement containing $& is inserted literally', () => {
  const odd = '<!-- evidence\npage: /a\nexpect: $& costs\n-->';
  assert.equal(mergeEvidence('<!-- evidence\npage: /b\n-->', odd), odd);
});

test('no block leaves the description unchanged', () => {
  assert.equal(mergeEvidence('Closes #5', ''), 'Closes #5');
});
