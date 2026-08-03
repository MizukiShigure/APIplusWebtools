# Asset Picker Favorites And Exact Upload Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent upload-asset favorites, a fixed picker toolbar, and SHA-256 exact duplicate reuse across every local/Agent upload entry point.

**Architecture:** Add a small browser/Node-compatible `asset-history-utils.js` module for stable favorite keys, exact fingerprints, filtering, hashing, and upload resolution. Keep DOM wiring in `app.js`, make all file upload workflows call one app-level adapter, and preserve the existing IndexedDB/control-history format by adding optional fields only.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Web Crypto API, Node.js `node:test`, IndexedDB/localStorage, existing `/fileupload` gateway.

## Global Constraints

- Favorites are local browser state and remain independent from append-only upload-history records.
- The picker adds only a favorites-only filter; no filename or URL search.
- Cross-URL deduplication requires SHA-256 plus matching filename, byte size, media type, and media metadata.
- Legacy records without hashes deduplicate only by identical normalized URL.
- Digest failure must not block upload or trigger metadata-only deduplication.
- Existing task locking, accepted media types, compressed-reference behavior, and per-type retention of 1,000 records remain unchanged.
- Preserve unrelated `model-contracts.js`, `model-contracts.test.cjs`, and RunningHub worktree changes.

---

### Task 1: Pure Asset Identity And Favorite Utilities

**Files:**
- Create: `asset-history-utils.js`
- Create: `asset-history-utils.test.cjs`

**Interfaces:**
- Produces: `AssetHistoryUtils.favoriteKey(asset) -> string`
- Produces: `AssetHistoryUtils.exactFingerprint(asset) -> string`
- Produces: `AssetHistoryUtils.findDuplicate(records, candidate) -> object|null`
- Produces: `AssetHistoryUtils.dedupe(records) -> object[]`
- Produces: `AssetHistoryUtils.filterPicker(records, options) -> object[]`
- Produces: `AssetHistoryUtils.sha256File(file, cryptoApi?) -> Promise<string>`
- Produces: `AssetHistoryUtils.resolveUpload(options) -> Promise<{asset, reused}>`

- [ ] **Step 1: Write the failing utility tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("./asset-history-utils.js");

test("favorite key prefers content hash and falls back to normalized URL", () => {
  assert.equal(U.favoriteKey({ contentHash: "ABCD", url: "https://old" }), "sha256:abcd");
  assert.equal(U.favoriteKey({ url: "  https://cdn/item.png  " }), "url:https://cdn/item.png");
});

test("exact duplicate requires matching metadata and hash", () => {
  const base = { name: "a.png", type: "image", size: 10, width: 100, height: 200, contentHash: "aa" };
  assert.equal(U.exactFingerprint(base), U.exactFingerprint({ ...base, url: "https://other" }));
  assert.notEqual(U.exactFingerprint(base), U.exactFingerprint({ ...base, contentHash: "bb" }));
});

test("legacy records only deduplicate by URL", () => {
  const records = [{ id: "a", name: "same.png", size: 10, url: "https://one" }];
  assert.equal(U.findDuplicate(records, { name: "same.png", size: 10, url: "https://two" }), null);
  assert.equal(U.findDuplicate(records, { url: " https://one " }).id, "a");
});

test("favorites-only filtering follows media type", () => {
  const records = [{ id: "a", type: "image", url: "https://a" }, { id: "b", type: "video", url: "https://b" }];
  assert.deepEqual(U.filterPicker(records, { type: "image", favoritesOnly: true, favorites: new Set(["url:https://a"]) }).map(x => x.id), ["a"]);
});

test("duplicate upload reuses an asset without calling transport", async () => {
  let calls = 0;
  const file = { name: "same.png", size: 3, type: "image/png", arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
  const hash = await U.sha256File(file, require("node:crypto").webcrypto);
  const existing = { id: "old", name: "same.png", originalName: "same.png", originalSize: 3, originalType: "image", originalWidth: 10, originalHeight: 20, contentHash: hash, url: "https://old" };
  const result = await U.resolveUpload({ file, identityMeta: { type: "image", width: 10, height: 20 }, uploadMeta: { type: "image", width: 10, height: 20 }, history: [existing], cryptoApi: require("node:crypto").webcrypto, upload: async () => { calls += 1; return "https://new"; } });
  assert.equal(result.reused, true);
  assert.equal(result.asset.id, "old");
  assert.equal(calls, 0);
});
```

- [ ] **Step 2: Run the utility tests and verify RED**

Run: `node --test asset-history-utils.test.cjs`

Expected: FAIL because `asset-history-utils.js` does not exist.

- [ ] **Step 3: Implement the browser/Node-compatible utility module**

Implement a UMD-style module exporting the seven interfaces above. Normalize hash to lowercase hex, normalize names with `trim().toLowerCase()`, normalize duration to milliseconds, and return an empty exact fingerprint unless `contentHash` exists. `resolveUpload` must digest the identity file, check history before calling `upload`, and persist `originalName`, `originalSize`, `originalType`, `originalWidth`, `originalHeight`, and `originalDuration` on new assets.

- [ ] **Step 4: Run the utility tests and verify GREEN**

Run: `node --test asset-history-utils.test.cjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the utility module**

```bash
git add asset-history-utils.js asset-history-utils.test.cjs
git commit -m "feat: add exact upload identity utilities"
```

### Task 2: Upload History Favorites And Canonical Deduplication

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Create: `asset-history-integration.test.cjs`

**Interfaces:**
- Consumes: all `AssetHistoryUtils` exports from Task 1.
- Produces: `state.uploadFavorites: Set<string>` and `state.assetFavoritesOnly: boolean`.
- Produces: `toggleUploadFavorite(assetId)` and canonical-returning `addUploadHistory(asset)`.

- [ ] **Step 1: Write failing integration contract tests**

The test reads `index.html` and `app.js` and asserts:

```js
assert.match(index, /asset-history-utils\.js/);
assert.match(app, /uploadFavorites:\s*new Set/);
assert.match(app, /assetFavoritesOnly:/);
assert.match(app, /function toggleUploadFavorite\(/);
assert.match(app, /ASSET_HISTORY_UTILS\.findDuplicate/);
assert.match(app, /ASSET_HISTORY_UTILS\.dedupe/);
```

It also loads the utility module and verifies `dedupe` keeps the first hashed duplicate and keeps two same-metadata legacy records when URLs differ.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `node --test asset-history-integration.test.cjs`

Expected: FAIL because the script and state fields are missing.

- [ ] **Step 3: Load utilities and add persistent favorite state**

Add `uploadFavorites` and `assetFavoritesOnly` storage keys. Initialize the state from JSON/localStorage. Add `uploadFavoriteKey`, `isUploadFavorite`, and `toggleUploadFavorite`; save only the key set and favorites-only boolean.

- [ ] **Step 4: Enforce canonical upload history**

Change `pruneUploadHistory` to sort newest-first, call `ASSET_HISTORY_UTILS.dedupe`, then apply per-type retention. Change `addUploadHistory` to return an existing duplicate before appending or scheduling a control-history event. For a new record, append once and return the normalized record.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test asset-history-utils.test.cjs asset-history-integration.test.cjs`

Expected: all tests PASS.

```bash
git add index.html app.js asset-history-integration.test.cjs
git commit -m "feat: persist upload favorites and canonical history"
```

### Task 3: Fixed Picker Toolbar And Favorites-Only UI

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Create: `asset-picker-ui-contract.test.cjs`

**Interfaces:**
- Consumes: `state.assetFilter`, `state.assetFavoritesOnly`, `isUploadFavorite`, and `toggleUploadFavorite`.
- Produces: fixed `.asset-dialog-toolbar`, scrollable `.asset-dialog-grid`, `#assetFavoritesOnly`, and per-card `[data-toggle-upload-favorite]` controls.

- [ ] **Step 1: Write the failing UI contract test**

Assert that HTML contains the fixed toolbar and favorite filter, CSS makes the panel overflow hidden and grid overflow auto, and app rendering includes a star button plus event propagation protection:

```js
assert.match(index, /class="asset-dialog-toolbar"/);
assert.match(index, /id="assetFavoritesOnly"/);
assert.match(styles, /\.asset-dialog-grid[\s\S]*overflow:\s*auto/);
assert.match(app, /data-toggle-upload-favorite/);
assert.match(app, /event\.stopPropagation\(\)/);
assert.match(app, /ASSET_HISTORY_UTILS\.filterPicker/);
```

- [ ] **Step 2: Run the UI contract and verify RED**

Run: `node --test asset-picker-ui-contract.test.cjs`

Expected: FAIL because the toolbar/filter/card controls are missing.

- [ ] **Step 3: Restructure the dialog and styles**

Wrap the existing title/close row and media tabs in `.asset-dialog-toolbar`, add `#assetFavoritesOnly`, set `.asset-dialog-panel` to a bounded two-row grid with `overflow: hidden`, and set `.asset-dialog-grid` to `min-height: 0; overflow: auto; align-content: start`.

- [ ] **Step 4: Render and bind favorites safely**

Use `ASSET_HISTORY_UTILS.filterPicker` in `renderAssetDialog`. Render each asset as an `<article>` card with a separate star button. Star clicks call `event.stopPropagation()`, toggle state, and rerender without closing the dialog. Card clicks and Enter/Space still choose the asset; audio controls must stop propagation.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test asset-history-utils.test.cjs asset-history-integration.test.cjs asset-picker-ui-contract.test.cjs`

Expected: all tests PASS.

```bash
git add index.html styles.css app.js asset-picker-ui-contract.test.cjs
git commit -m "feat: add favorite filtering to asset picker"
```

### Task 4: One Exact-Deduplicating Upload Path

**Files:**
- Modify: `app.js`
- Create: `asset-upload-flow.test.cjs`

**Interfaces:**
- Consumes: `ASSET_HISTORY_UTILS.resolveUpload`.
- Produces: `postUploadFile(file) -> Promise<string>`.
- Produces: `uploadLocalFileAsset(file, options) -> Promise<{asset, reused}>` where options may contain `uploadFile`, `identityMeta`, `uploadMeta`, and `overrides`.

- [ ] **Step 1: Write the failing upload-flow contract test**

Assert that `app.js` defines `postUploadFile` and `uploadLocalFileAsset`, calls `resolveUpload`, and every direct local/Agent workflow calls the adapter. Assert that `/fileupload` appears only inside `postUploadFile`.

- [ ] **Step 2: Run the upload-flow test and verify RED**

Run: `node --test asset-upload-flow.test.cjs`

Expected: FAIL because upload requests are still duplicated across workflows.

- [ ] **Step 3: Implement the shared adapter**

`postUploadFile` owns FormData, fetch, response parsing, and URL validation. `uploadLocalFileAsset` delegates to `resolveUpload` with `state.uploadHistory`, `crypto`, `uid`, and `Date.now`.

- [ ] **Step 4: Replace every upload workflow**

Route avatar, Vidu voice, subject, motion, Suno, image-to-video, batch image, multimodal reference, Vidu reference, generic upload, generated-frame upload, and staged Agent assets through the adapter. Pass the original file/meta as identity and the compressed file/meta as upload data for Seedance preparation. Preserve each caller's existing assignment, locking, error message, render, and persistence behavior.

- [ ] **Step 5: Verify duplicate reuse and commit**

Run: `node --test asset-history-utils.test.cjs asset-history-integration.test.cjs asset-picker-ui-contract.test.cjs asset-upload-flow.test.cjs`

Expected: all tests PASS and the resolver test confirms transport is not called for a duplicate.

```bash
git add app.js asset-upload-flow.test.cjs
git commit -m "refactor: reuse exact duplicate uploads"
```

### Task 5: Packaging, Regression Tests, And Visual Verification

**Files:**
- Modify: `package.json`
- Modify: `scripts/build-portable.ps1`
- Modify: `portable-package.test.cjs`
- Modify: `CHANGELOG.md`
- Modify: `index.html`

**Interfaces:**
- Consumes: completed utility, app, and UI behavior.
- Produces: portable package containing the new module and tests.

- [ ] **Step 1: Add new checks to package and portable manifests**

Add `node --check asset-history-utils.js` and all three new test files to `npm test`. Add the utility and tests to `$publicFiles`, and assert their presence in `portable-package.test.cjs`.

- [ ] **Step 2: Update cache-busting and changelog**

Use a `release-20260803-asset-picker-favorites-dedup` query on the new utility and `app.js`/`styles.css` references. Add a concise changelog entry describing favorites-only filtering, fixed toolbar, and SHA-256 duplicate reuse.

- [ ] **Step 3: Run focused and full verification**

Run:

```bash
node --test asset-history-utils.test.cjs asset-history-integration.test.cjs asset-picker-ui-contract.test.cjs asset-upload-flow.test.cjs
npm test
npm run package
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Perform browser visual verification**

Reload the local service, open the asset picker with enough records to scroll, and verify at desktop and narrow widths:

- Title, close, media tabs, and favorites-only control do not move.
- Only the grid scrolls.
- Star toggling never selects an asset or closes the dialog.
- Favorites-only immediately hides non-favorites.
- Selecting a card still fills the intended row.

- [ ] **Step 5: Commit packaging and verification changes**

```bash
git add package.json scripts/build-portable.ps1 portable-package.test.cjs CHANGELOG.md index.html
git commit -m "chore: package asset picker favorites and dedup"
```
