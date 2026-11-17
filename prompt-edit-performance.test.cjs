const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}
let renders = 0;
let saves = 0;
let timer;
const context = vm.createContext({
  setTimeout: fn => { timer = fn; return 1; }, clearTimeout: () => {},
  isMultiRowLocked: () => false,
  markRowDirty: () => false,
  persistMultiRows: () => saves++, render: () => renders++,
  refreshRowSubmittedStateDisplay: () => {},
  createPromptDetailContext: row => ({ updatePrompt: text => { row.prompt = text; return true; }, persist: () => saves++ }),
  findRenderedTaskRow: () => null
});
vm.runInContext('const pendingPromptSaves = new Map();', context);
if (source.includes('function updateInlinePrompt(')) {
  for (const name of ['flushInlinePromptSaves', 'updateInlinePrompt']) vm.runInContext(declaration(name), context);
}
vm.runInContext(declaration('updateMultiRowField'), context);
context.row = { prompt: 'before' };
for (let i = 0; i < 100; i++) vm.runInContext(`updateMultiRowField(row, 'prompt', 'edit${i}', false)`, context);
assert.equal(context.row.prompt, 'edit99', 'edits update the row immediately');
assert.equal(saves, 0, 'typing must not stringify every row on every keystroke');
timer();
assert.equal(saves, 1, 'a burst of edits persists once');
vm.runInContext("updateMultiRowField(row, 'prompt', 'edit99', true)", context);
assert.equal(renders, 0, 'blur/change must not replace the DOM before a reference click');
console.log('prompt edit performance checks passed');
