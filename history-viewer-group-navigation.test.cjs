const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const pageSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `missing body for ${name}`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function ${name}`);
}

const helperNames = [
  "findGroupedHistoryCursor",
  "groupedHistoryNavigationTargets",
  "groupedHistoryDeleteTarget"
];
const helperSource = helperNames.map(name => extractFunction(appSource, name)).join("\n");
const helpers = Function(`${helperSource}\nreturn { ${helperNames.join(", ")} };`)();

function entry(key, url = `${key}.mp4`) {
  return {
    token: `generation:${key}`,
    item: { key, url }
  };
}

const groups = [
  { id: "newest", items: [entry("a1"), entry("a2")] },
  { id: "middle", items: [entry("b1"), entry("b2"), entry("b3")] },
  { id: "oldest", items: [entry("c1")] }
];

assert.deepEqual(
  helpers.findGroupedHistoryCursor(groups, entry("b2")),
  { groupIndex: 1, itemIndex: 1 },
  "the cursor must resolve the exact generation result key"
);
assert.deepEqual(
  helpers.findGroupedHistoryCursor(groups, { token: String("legacy"), item: { url: "b2.mp4" } }),
  { groupIndex: 1, itemIndex: 1 },
  "legacy entries must fall back to URL matching"
);
assert.equal(
  helpers.findGroupedHistoryCursor(groups, entry("missing")),
  null,
  "unknown results must fail safely"
);

const middleTargets = helpers.groupedHistoryNavigationTargets(groups, entry("b2"));
assert.equal(middleTargets.previousItem.item.key, "b1");
assert.equal(middleTargets.nextItem.item.key, "b3");
assert.equal(middleTargets.previousGroup.item.key, "a1", "previous group must open item zero");
assert.equal(middleTargets.nextGroup.item.key, "c1", "next group must open item zero");
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("b1")).previousItem, null);
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("b3")).nextItem, null);
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("a1")).previousGroup, null);
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("c1")).nextGroup, null);

assert.equal(
  helpers.groupedHistoryDeleteTarget(groups, entry("b2")).item.key,
  "b3",
  "deletion must prefer the next item in the same group"
);
assert.equal(
  helpers.groupedHistoryDeleteTarget(groups, entry("b3")).item.key,
  "b2",
  "deletion must fall back to the previous item in the same group"
);
assert.equal(
  helpers.groupedHistoryDeleteTarget(groups, entry("c1")).item.key,
  "b1",
  "deletion must use the previous group when no next group exists"
);
assert.equal(
  helpers.groupedHistoryDeleteTarget([{ id: "only", items: [entry("solo")] }], entry("solo")),
  null,
  "deleting the only result must leave no continuation"
);

const groupBuilderSource = extractFunction(appSource, "generationHistoryNavigationGroups");
assert.match(groupBuilderSource, /filteredGenerationInputGroups\(\)/);
assert.doesNotMatch(groupBuilderSource, /visibleGenerationInputGroups\(\)/);
assert.match(packageJson.scripts.test, /node history-viewer-group-navigation\.test\.cjs/);

const ensureViewerSource = extractFunction(appSource, "ensureHistoryVideoOverlay");
const openViewerSource = extractFunction(appSource, "openHistoryMediaViewer");
const deleteViewerSource = extractFunction(appSource, "deleteHistoryMediaFromViewer");

assert.match(ensureViewerSource, /data-history-viewer-prev-group[^>]*>上一组</);
assert.match(ensureViewerSource, /data-history-viewer-prev[^>]*>上一条</);
assert.match(ensureViewerSource, /data-history-viewer-next[^>]*>下一条</);
assert.match(ensureViewerSource, /data-history-viewer-next-group[^>]*>下一组</);
assert.match(ensureViewerSource, /data-history-viewer-prev-group/);
assert.match(openViewerSource, /source === "history" && entry\.item\?\.key/);
assert.match(openViewerSource, /generationHistoryNavigationGroups\(entry\.item\.type\)/);
assert.match(openViewerSource, /groupedHistoryNavigationTargets/);
assert.match(openViewerSource, /prevGroupButton\.hidden = !groupedTargets/);
assert.match(openViewerSource, /nextGroupButton\.hidden = !groupedTargets/);
assert.match(deleteViewerSource, /groupedHistoryDeleteTarget/);
assert.match(deleteViewerSource, /openHistoryMediaViewer\(nextEntry\.token/);
assert.match(ensureViewerSource, /ArrowLeft[\s\S]*data-history-viewer-prev/);
assert.match(ensureViewerSource, /ArrowRight[\s\S]*data-history-viewer-next/);
assert.match(
  cssSource,
  /\.history-video-viewer-head\s*\{[\s\S]*?grid-template-columns:\s*auto auto minmax\(0, 1fr\) auto auto auto/
);
assert.match(openViewerSource, /classList\.toggle\("grouped-navigation", Boolean\(groupedTargets\)\)/);
assert.match(
  cssSource,
  /\.history-video-overlay:not\(\.grouped-navigation\) \.history-video-viewer-head\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) auto auto/
);
assert.match(
  cssSource,
  /@media \(max-width: 820px\)[\s\S]*?\.history-video-overlay \.history-video-viewer-head\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/
);
assert.match(pageSource, /app\.js\?v=update-20261115-image-models/);

console.log("history viewer group navigation checks passed");
