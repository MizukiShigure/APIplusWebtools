const assert = require("node:assert/strict");
const { insertPromptToken } = require("./prompt-detail-utils.js");

assert.deepEqual(
  insertPromptToken("前景后景", 2, 2, "@1"),
  { value: "前景@1后景", caret: 4 },
  "insertion must occur at the current caret"
);
assert.deepEqual(
  insertPromptToken("把这里替换", 1, 3, "@2"),
  { value: "把@2替换", caret: 3 },
  "the token must replace the selected text"
);
assert.deepEqual(
  insertPromptToken("abcdef", 5, 2, "@3"),
  { value: "ab@3f", caret: 4 },
  "reversed selection bounds must be normalized"
);
assert.deepEqual(
  insertPromptToken("abc", -20, 99, "@4"),
  { value: "@4", caret: 2 },
  "selection bounds must be clamped to the text"
);

console.log("prompt detail utility checks passed");
