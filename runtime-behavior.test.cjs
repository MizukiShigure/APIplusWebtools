const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

function handlerBody(selector) {
  const marker = `tr.querySelector(".${selector}").addEventListener("click", () => {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${selector} click handler must exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(bodyStart + 1, index);
  }
  throw new Error(`${selector} click handler is not closed`);
}

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(bodyStart + 1, index);
  }
  throw new Error(`${name} is not closed`);
}

[
  "duplicate-row",
  "duplicate-image-video-row",
  "duplicate-motion-row",
  "duplicate-avatar-row",
  "duplicate-multi-row",
  "duplicate-vidu-ref-row"
].forEach(selector => {
  assert.doesNotMatch(handlerBody(selector), /is[A-Za-z]+RowLocked\(row\)/, `${selector} must work while the source row is running`);
});

assert.match(
  source,
  /seedance:\s*\{[\s\S]*?prepareSeedanceReferences:\s*true,[\s\S]*?kling3Omni:/,
  "only the Seedance multimodal model should opt into Seedance reference preparation"
);
const referenceUpload = functionBody("uploadReferenceFiles");
const seedanceGuardIndex = referenceUpload.indexOf("if (getMultiModel(row).prepareSeedanceReferences)");
const seedancePrepareIndex = referenceUpload.indexOf("await prepareSeedanceReferenceFile(file, meta)");
assert.ok(seedanceGuardIndex >= 0 && seedancePrepareIndex > seedanceGuardIndex, "reference upload must guard Seedance-only compression by the active model");
assert.match(
  source,
  /row\.quality = nearestQualityOption\(row\.quality, getMultiQualityOptions\(row\), getMultiQualityOptions\(row\)\[0\] \|\| ""\);/,
  "Seedance version changes must select the nearest supported quality"
);
assert.match(
  source,
  /row\.quality = nearestQualityOption\(row\.quality, getImageVideoQualityOptions\(row\), getImageVideoQualityOptions\(row\)\[0\] \|\| ""\);/,
  "Seedance image-video version changes must select the nearest supported quality"
);
assert.doesNotMatch(source, /可灵 3 Omni 已预留，待单独规则配置/, "the multimodal page must not describe Kling Omni as unavailable");
assert.match(source, /formatProviderError\(json, `HTTP \$\{response\.status\}`\)/, "HTTP failures must preserve their structured response body");
assert.doesNotMatch(source, /if \(!response\.success\) throw new Error\(response\.message \|\|/, "task failures must not discard structured provider details");

console.log("runtime behavior checks passed");
