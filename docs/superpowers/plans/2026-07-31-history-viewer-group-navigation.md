# History Viewer Group Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generation-cache image and video previews navigate within their input group and between adjacent cache groups without flattening the filtered history into time order.

**Architecture:** Keep `filteredGenerationInputGroups()` as the only source of group ordering and derive a media-specific two-dimensional navigation model from it. Pure cursor helpers expose previous/next item, previous/next group, and post-delete continuation targets; the existing full-screen viewer consumes those helpers only for generation-cache entries while upload-cache and task-row previews retain flat navigation.

**Tech Stack:** Vanilla JavaScript, HTML, CSS, Node.js `node:assert`, PowerShell portable packaging.

## Global Constraints

- Group order must come from `filteredGenerationInputGroups()`, including active media type, model, size, favorites, and prompt-search filters.
- Previous/next item must never cross the current group boundary.
- Previous/next group must open item index `0` of the adjacent group, including across cache pagination boundaries.
- Arrow Left and Arrow Right must remain group-item navigation.
- Upload-cache and task-row result previews must retain their current flat behavior and must not expose group controls.
- Deleting the open result must continue to same-group next, same-group previous, next-group first, previous-group first, then close.
- Existing unrelated working-tree files must not be edited or staged.

---

### Task 1: Grouped Navigation Model

**Files:**
- Create: `history-viewer-group-navigation.test.cjs`
- Modify: `app.js:11456-11546`
- Modify: `package.json`

**Interfaces:**
- Consumes: `filteredGenerationInputGroups()`, `historyMediaToken(item)`, and `fileNameFromUrl(url, fallback)`.
- Produces: `generationHistoryNavigationGroups(type) -> Array<{id, items}>`, `findGroupedHistoryCursor(groups, entry) -> {groupIndex, itemIndex}|null`, `groupedHistoryNavigationTargets(groups, entry) -> {previousItem, nextItem, previousGroup, nextGroup}|null`, and `groupedHistoryDeleteTarget(groups, entry) -> entry|null`.

- [ ] **Step 1: Write the failing grouped-navigation regression test**

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`unterminated function ${name}`);
}

const helperNames = [
  "findGroupedHistoryCursor",
  "groupedHistoryNavigationTargets",
  "groupedHistoryDeleteTarget"
];
const helpers = Function(
  `${helperNames.map(name => extractFunction(appSource, name)).join("\n")}
   return { ${helperNames.join(", ")} };`
)();

const entry = key => ({ token: `generation:${key}`, item: { key, url: `${key}.mp4` } });
const groups = [
  { id: "newest", items: [entry("a1"), entry("a2")] },
  { id: "middle", items: [entry("b1"), entry("b2"), entry("b3")] },
  { id: "oldest", items: [entry("c1")] }
];

assert.deepEqual(helpers.findGroupedHistoryCursor(groups, entry("b2")), { groupIndex: 1, itemIndex: 1 });
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("b2")).previousItem.item.key, "b1");
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("b2")).nextItem.item.key, "b3");
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("b2")).previousGroup.item.key, "a1");
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("b2")).nextGroup.item.key, "c1");
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("b1")).previousItem, null);
assert.equal(helpers.groupedHistoryNavigationTargets(groups, entry("b3")).nextItem, null);
assert.equal(helpers.groupedHistoryDeleteTarget(groups, entry("b2")).item.key, "b3");
assert.equal(helpers.groupedHistoryDeleteTarget(groups, entry("b3")).item.key, "b2");

assert.match(extractFunction(appSource, "generationHistoryNavigationGroups"), /filteredGenerationInputGroups\(\)/);
assert.doesNotMatch(extractFunction(appSource, "generationHistoryNavigationGroups"), /visibleGenerationInputGroups\(\)/);
assert.match(packageJson.scripts.test, /node history-viewer-group-navigation\.test\.cjs/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node history-viewer-group-navigation.test.cjs`

Expected: FAIL with `missing function findGroupedHistoryCursor`.

- [ ] **Step 3: Implement the minimal grouped-navigation helpers**

```js
function generationHistoryNavigationGroups(type = state.historyType) {
  const targetType = type || state.historyType;
  return filteredGenerationInputGroups()
    .map(group => ({
      id: group.id,
      items: group.items
        .filter(item => item.type === targetType && item.url)
        .map(item => ({
          token: historyMediaToken(item),
          item,
          title: item.name || fileNameFromUrl(item.url, targetType || "media")
        }))
    }))
    .filter(group => group.items.length);
}

function findGroupedHistoryCursor(groups, entry) {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const itemIndex = groups[groupIndex].items.findIndex(candidate =>
      (entry?.item?.key && candidate.item?.key === entry.item.key)
      || candidate.token === entry?.token
      || candidate.item?.url === entry?.item?.url
    );
    if (itemIndex >= 0) return { groupIndex, itemIndex };
  }
  return null;
}

function groupedHistoryNavigationTargets(groups, entry) {
  const cursor = findGroupedHistoryCursor(groups, entry);
  if (!cursor) return null;
  const currentGroup = groups[cursor.groupIndex];
  return {
    cursor,
    previousItem: currentGroup.items[cursor.itemIndex - 1] || null,
    nextItem: currentGroup.items[cursor.itemIndex + 1] || null,
    previousGroup: groups[cursor.groupIndex - 1]?.items[0] || null,
    nextGroup: groups[cursor.groupIndex + 1]?.items[0] || null
  };
}

function groupedHistoryDeleteTarget(groups, entry) {
  const targets = groupedHistoryNavigationTargets(groups, entry);
  return targets?.nextItem
    || targets?.previousItem
    || targets?.nextGroup
    || targets?.previousGroup
    || null;
}
```

Append `node history-viewer-group-navigation.test.cjs` to the `test` script in `package.json`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node history-viewer-group-navigation.test.cjs`

Expected: `history viewer group navigation checks passed`.

- [ ] **Step 5: Commit the navigation model**

```bash
git add app.js package.json history-viewer-group-navigation.test.cjs
git commit -m "feat: model grouped history navigation"
```

---

### Task 2: Viewer Controls and Delete Continuation

**Files:**
- Modify: `app.js:11548-11758`
- Modify: `styles.css:2199-2213`
- Modify: `history-viewer-group-navigation.test.cjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 1 helpers and the existing `historyMediaNavigationItems(entry, source)` flat fallback.
- Produces: Four viewer controls with selectors `data-history-viewer-prev-group`, `data-history-viewer-prev`, `data-history-viewer-next`, and `data-history-viewer-next-group`.

- [ ] **Step 1: Extend the regression test for markup, integration, and delete behavior**

```js
const ensureViewerSource = extractFunction(appSource, "ensureHistoryVideoOverlay");
const openViewerSource = extractFunction(appSource, "openHistoryMediaViewer");
const deleteViewerSource = extractFunction(appSource, "deleteHistoryMediaFromViewer");

assert.match(ensureViewerSource, /data-history-viewer-prev-group[^>]*>上一组</);
assert.match(ensureViewerSource, /data-history-viewer-prev[^>]*>上一条</);
assert.match(ensureViewerSource, /data-history-viewer-next[^>]*>下一条</);
assert.match(ensureViewerSource, /data-history-viewer-next-group[^>]*>下一组</);
assert.match(openViewerSource, /source === "history"/);
assert.match(openViewerSource, /generationHistoryNavigationGroups/);
assert.match(openViewerSource, /groupedHistoryNavigationTargets/);
assert.match(openViewerSource, /prevGroupButton\.hidden = !groupedTargets/);
assert.match(openViewerSource, /nextGroupButton\.hidden = !groupedTargets/);
assert.match(deleteViewerSource, /groupedHistoryDeleteTarget/);
assert.match(deleteViewerSource, /openHistoryMediaViewer\(nextEntry\.token/);
assert.match(appSource, /ArrowLeft[\s\S]*data-history-viewer-prev/);
assert.match(appSource, /ArrowRight[\s\S]*data-history-viewer-next/);
assert.match(pageSource, /app\.js\?v=release-20260731-history-group-navigation/);
```

- [ ] **Step 2: Run the focused test and verify the new assertions fail**

Run: `node history-viewer-group-navigation.test.cjs`

Expected: FAIL because the four-control markup and grouped viewer integration are absent.

- [ ] **Step 3: Integrate grouped navigation into the viewer**

In `openHistoryMediaViewer`, query the two new group buttons and, on every `renderToken`, derive:

```js
const groupedTargets = source === "history" && entry.item?.key
  ? groupedHistoryNavigationTargets(generationHistoryNavigationGroups(entry.item.type), entry)
  : null;
```

When `groupedTargets` exists:

```js
prevGroupButton.hidden = false;
nextGroupButton.hidden = false;
prevButton.disabled = !groupedTargets.previousItem;
nextButton.disabled = !groupedTargets.nextItem;
prevGroupButton.disabled = !groupedTargets.previousGroup;
nextGroupButton.disabled = !groupedTargets.nextGroup;
prevButton.onclick = () => groupedTargets.previousItem && renderToken(groupedTargets.previousItem.token);
nextButton.onclick = () => groupedTargets.nextItem && renderToken(groupedTargets.nextItem.token);
prevGroupButton.onclick = () => groupedTargets.previousGroup && renderToken(groupedTargets.previousGroup.token);
nextGroupButton.onclick = () => groupedTargets.nextGroup && renderToken(groupedTargets.nextGroup.token);
```

Otherwise hide group controls and preserve the current flat previous/next logic.

Replace the viewer header with:

```html
<button class="ghost-button" data-history-viewer-prev-group type="button">上一组</button>
<button class="ghost-button" data-history-viewer-prev type="button">上一条</button>
<strong class="history-viewer-title" data-history-viewer-title></strong>
<button class="ghost-button" data-history-viewer-next type="button">下一条</button>
<button class="ghost-button" data-history-viewer-next-group type="button">下一组</button>
<button class="ghost-button" data-history-viewer-close type="button">关闭</button>
```

Recreate stale viewer markup when either the image surface or grouped controls are missing.

- [ ] **Step 4: Implement grouped deletion continuation**

Before deleting, select the continuation target with:

```js
const grouped = source === "history" && entry.item?.key
  ? generationHistoryNavigationGroups(entry.item.type)
  : [];
const groupedCursor = findGroupedHistoryCursor(grouped, entry);
const nextEntry = groupedCursor
  ? groupedHistoryDeleteTarget(grouped, entry)
  : flatDeleteTarget;
```

After deletion and `render()`, reopen with `nextEntry.token`, causing the viewer to rebuild the filtered grouped snapshot. Close only when no target remains.

- [ ] **Step 5: Stabilize the six-control header and update the cache version**

Add a six-column header grid while keeping the filename shrinkable:

```css
.history-video-viewer-head {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto auto;
}
```

At narrow widths, allow the title to occupy its own first row and the controls to remain usable. Change the `app.js` query in `index.html` to `release-20260731-history-group-navigation`.

- [ ] **Step 6: Run focused and syntax tests**

Run: `node history-viewer-group-navigation.test.cjs`

Expected: `history viewer group navigation checks passed`.

Run: `node --check app.js`

Expected: exit code `0`.

- [ ] **Step 7: Commit viewer behavior**

```bash
git add app.js styles.css index.html history-viewer-group-navigation.test.cjs
git commit -m "feat: navigate history previews by group"
```

---

### Task 3: Portable Package and End-to-End Verification

**Files:**
- Modify: `scripts/build-portable.ps1`
- Modify: `portable-package.test.cjs`

**Interfaces:**
- Consumes: `history-viewer-group-navigation.test.cjs` and the existing portable-package manifest.
- Produces: A portable archive whose included `package.json` test command references only included test files.

- [ ] **Step 1: Write the failing portable manifest assertions**

Add both recent regression tests to `expectedEntries`:

```js
"history-viewer-group-navigation.test.cjs",
"row-completion-time.test.cjs",
```

- [ ] **Step 2: Run the portable-package test and verify it fails**

Run: `node portable-package.test.cjs`

Expected: FAIL because the build manifest does not yet include the two tests.

- [ ] **Step 3: Add the regression tests to the portable build manifest**

Add to `$publicFiles` in `scripts/build-portable.ps1`:

```powershell
"history-viewer-group-navigation.test.cjs",
"row-completion-time.test.cjs",
```

- [ ] **Step 4: Run the complete validation suite**

Run: `npm test`

Expected: all checks pass, including `history viewer group navigation checks passed`.

Run: `npm run package`

Expected: a ZIP is written under `dist` with no missing-file error.

- [ ] **Step 5: Verify the served page and cache version**

Run:

```powershell
$html = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4198/).Content
if ($html -notmatch 'app\.js\?v=release-20260731-history-group-navigation') { throw 'served cache version is stale' }
```

Expected: exit code `0`.

- [ ] **Step 6: Inspect the final diff and commit**

Run: `git diff --check`

Expected: no output.

```bash
git add scripts/build-portable.ps1 portable-package.test.cjs
git commit -m "build: include history navigation tests"
```

Run: `git status --short`

Expected: only the pre-existing unrelated untracked files remain.
