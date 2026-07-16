const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "app.js");
const source = fs.readFileSync(appPath, "utf8");

assert.match(source, /class="tiny-button clear-prompt"/, "prompt cells must expose a clear prompt button");
assert.match(source, /data-clear-row-assets/, "image rows must expose a clear reference/image button");
assert.match(source, /data-clear-frame/, "image-to-video frame pickers must expose clear buttons");
assert.match(source, /data-clear-single-asset/, "single asset pickers must expose clear buttons");
assert.match(source, /data-clear-multi-refs/, "multi-modal reference picker must expose a clear button");
assert.match(source, /data-clear-vidu-ref-assets/, "Vidu reference picker must expose a clear button");

[
  "clearPromptForRow",
  "clearRowImages",
  "clearImageVideoFrame",
  "clearMotionAsset",
  "clearAvatarAsset",
  "clearMultiRefs",
  "clearViduRefAssets"
].forEach(name => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  const section = source.slice(start, nextFunction === -1 ? source.length : nextFunction);
  assert.match(section, /markRowDirty\(row\)/, `${name} must mark submitted rows dirty`);
});

console.log("dirty-row-clear checks passed");
