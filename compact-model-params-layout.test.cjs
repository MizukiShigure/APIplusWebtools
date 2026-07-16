const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

assert.match(source, /function renderStackedControlCell\(/, "compact stacked control renderer must exist");
assert.match(source, /function renderImageModelCell\(/, "image rows must use a compact model/version cell");
assert.match(source, /function renderImageParamsCell\(/, "image rows must use a compact size/quality cell");
assert.match(source, /function renderImageVideoModelCell\(/, "image-to-video rows must use a compact model/version cell");
assert.match(source, /function renderImageVideoParamsCell\(/, "image-to-video rows must use a compact size/quality/duration cell");
assert.match(source, /function renderMultiModelCell\(/, "multi-modal rows must use a compact model/version cell");
assert.match(source, /function renderMultiParamsCell\(/, "multi-modal rows must use a compact size/quality/duration cell");
assert.match(source, /function renderViduRefModelCell\(/, "Vidu reference rows must use a compact model/version cell");
assert.match(source, /function renderViduRefParamsCell\(/, "Vidu reference rows must use a compact size/quality/duration cell");
assert.match(source, /function renderMotionParamsCell\(/, "motion rows must use a compact size/quality cell");
assert.match(source, /function renderAvatarModelCell\(/, "avatar rows must use a compact model/version cell");

assert.ok((source.match(/<th>模型<\/th>/g) || []).length >= 6, "task tables should keep a compact model column");
assert.ok((source.match(/<th>参数<\/th>/g) || []).length >= 5, "task tables should expose compact parameter columns");
assert.ok(!source.includes("<th>模型版本</th>"), "model version should not be a standalone table column");
assert.ok(!source.includes("<th>清晰度</th>"), "quality should not be a standalone table column");
assert.ok(!source.includes("<th>时长</th>"), "duration should not be a standalone table column");

console.log("compact-model-params-layout checks passed");
