# MiniMax H3 Model Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MiniMax H3 to image-to-video as first/last-frame generation and to multimodal video as omnireference generation through the existing company gateway.

**Architecture:** `model-contracts.js` owns the single H3 capability definition, validation rules, prompt reference conversion, and request builders. `app.js` exposes that shared contract through one model entry in each existing task table and reuses the current queue, polling, refresh recovery, history, upload, and result flows.

**Tech Stack:** Browser JavaScript, CommonJS-compatible UMD contract module, Node.js `assert` contract tests, existing local static server and PM2 process.

## Global Constraints

- Company gateway base remains `https://gateway.example/api`.
- Create endpoint is `/minimax_h3`; query endpoint is `/minimax_h3_query`.
- Gateway model value is exactly `MiniMax-H3`.
- Image-to-video uses H3 first/last-frame mode; multimodal video uses H3 omnireference mode.
- Allowed ratios are `adaptive`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, and `9:16`.
- Allowed resolutions are `768P` and `2K`; durations are integer seconds from 5 through 15.
- Defaults are `9:16`, `768P`, 5 seconds, and generated audio enabled.
- Multimodal references are limited to 12 total assets and 15 known seconds of reference video.
- Audio cannot be the only multimodal reference.
- Existing Hailuo, Seedance, Kling, Vidu, queue, history, and refresh-recovery behavior must remain unchanged.
- Do not submit a paid live generation task during automated verification.

---

### Task 1: Shared MiniMax H3 Contract

**Files:**
- Modify: `model-contracts.test.cjs`
- Modify: `model-contracts.js`

**Interfaces:**
- Produces: `MINIMAX_H3`
- Produces: `buildMiniMaxH3FirstLastPayload(row): object`
- Produces: `buildMiniMaxH3MultiPayload(row): object`
- Produces: `validateMiniMaxH3FirstLastRow(row): string`
- Produces: `validateMiniMaxH3MultiRow(row): string`

- [ ] **Step 1: Write failing contract tests**

Add imports and assertions that define the exact public contract:

```js
const {
  MINIMAX_H3,
  buildMiniMaxH3FirstLastPayload,
  buildMiniMaxH3MultiPayload,
  validateMiniMaxH3FirstLastRow,
  validateMiniMaxH3MultiRow
} = contracts;

assert.deepEqual(MINIMAX_H3, {
  endpoint: "/minimax_h3",
  queryEndpoint: "/minimax_h3_query",
  version: "MiniMax-H3",
  sizes: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  qualities: ["768P", "2K"],
  durations: ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
  defaultSize: "9:16",
  defaultQuality: "768P",
  defaultDuration: "5",
  maxRefs: 12,
  maxReferenceVideoDuration: 15
});
```

Cover first-frame required, last-frame optional, empty prompt omission, audio toggle, all enum validation, mixed reference arrays, visible-order `@N` conversion, legacy `<<image_N>>` conversion, prompt-only input, reference-only image/video input, audio-only rejection, the 12/13 asset boundary, and the 15/>15 second known-video boundary.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
node model-contracts.test.cjs
```

Expected: FAIL because `MINIMAX_H3` and the H3 functions are not exported.

- [ ] **Step 3: Implement the shared contract**

Add the capability object and builders to `model-contracts.js`. Use visible reference order to assign type-specific labels:

```js
function buildMiniMaxH3ReferenceLabels(refs) {
  const counts = { image: 0, video: 0, audio: 0 };
  return refs.map((asset, index) => {
    counts[asset.type] += 1;
    const prefix = asset.type === "image" ? "图片" : asset.type === "video" ? "视频" : "音频";
    return { token: `@${index + 1}`, label: `${prefix}${counts[asset.type]}`, type: asset.type };
  });
}
```

Build the shared fields with omitted optional values:

```js
function buildMiniMaxH3BasePayload(row) {
  return {
    prompt: String(row.prompt || "").trim() || undefined,
    model_name: MINIMAX_H3.version,
    generate_audio: row.generateAudio !== false,
    ratio: row.size,
    duration: Number(row.duration),
    resolution: row.quality
  };
}
```

The first/last builder adds `first_frame_image` and only adds `last_frame_image` when present. The multimodal builder filters references with URLs, converts prompt markers, groups URLs into `reference_images`, `reference_videos`, and `reference_audios`, and omits empty arrays.

Validation returns concise Chinese errors and never rejects a video solely because its duration is unknown.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run:

```powershell
node model-contracts.test.cjs
```

Expected: `model-contracts checks passed`.

- [ ] **Step 5: Commit the shared contract**

```powershell
git add model-contracts.js model-contracts.test.cjs
git commit -m "feat: add MiniMax H3 model contract"
```

### Task 2: Bind H3 to Both Existing Task Tables

**Files:**
- Modify: `model-contracts.test.cjs`
- Modify: `runtime-behavior.test.cjs`
- Modify: `app.js`

**Interfaces:**
- Consumes: the five H3 exports from Task 1.
- Produces: `IMAGE_VIDEO_MODELS.minimaxH3` in first/last-frame mode.
- Produces: `MULTI_VIDEO_MODELS.minimaxH3` in omnireference mode.
- Produces: persisted `generateAudio` state for H3 image-to-video rows.

- [ ] **Step 1: Write failing application wiring tests**

Add source-contract assertions proving both entries use the shared contract:

```js
assert.match(imageVideoModelsSource, /minimaxH3:\s*\{[\s\S]*?endpoint:\s*MINIMAX_H3\.endpoint[\s\S]*?buildMiniMaxH3FirstLastPayload/);
assert.match(multiVideoModelsSource, /minimaxH3:\s*\{[\s\S]*?endpoint:\s*MINIMAX_H3\.endpoint[\s\S]*?buildMiniMaxH3MultiPayload/);
assert.match(appSource, /function renderImageVideoParamsCell[\s\S]*?supportsGenerateAudio[\s\S]*?data-image-video-field="generateAudio"/);
assert.match(appSource, /function validateImageVideoRowBeforeQueue[\s\S]*?model\.requiresPrompt !== false/);
assert.match(appSource, /function validateMultiRowBeforeQueue[\s\S]*?model\.requiresPrompt !== false/);
```

Add runtime behavior assertions for:

- H3 image-to-video defaults: `9:16`, `768P`, `5`, `generateAudio: true`.
- H3 multimodal defaults: the same values.
- Switching to H3 keeps an already-compatible value and otherwise selects the H3 default.
- Image-to-video H3 allows an empty prompt when a first frame exists.
- Multimodal H3 allows prompt-only and reference-only valid rows.

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```powershell
node model-contracts.test.cjs
node runtime-behavior.test.cjs
```

Expected: FAIL because `app.js` does not yet expose either H3 model entry or the image-to-video audio control.

- [ ] **Step 3: Add both model entries and row defaults**

Import the H3 contract:

```js
const {
  KLING_3_OMNI,
  MINIMAX_H3,
  formatProviderError,
  nearestQualityOption,
  seedance2QualityOptions
} = MODEL_CONTRACTS;
```

Add `IMAGE_VIDEO_MODELS.minimaxH3` with:

```js
{
  label: "海螺 H3",
  endpoint: MINIMAX_H3.endpoint,
  queryEndpoint: MINIMAX_H3.queryEndpoint,
  async: true,
  versions: [{ label: "MiniMax H3", value: MINIMAX_H3.version }],
  sizes: MINIMAX_H3.sizes,
  qualities: MINIMAX_H3.qualities,
  durations: MINIMAX_H3.durations,
  defaultSize: MINIMAX_H3.defaultSize,
  defaultQuality: MINIMAX_H3.defaultQuality,
  defaultDuration: MINIMAX_H3.defaultDuration,
  supportsTextOnly: false,
  requiresPrompt: false,
  supportsFirstFrame: true,
  supportsLastFrame: true,
  supportsGenerateAudio: true,
  validate: MODEL_CONTRACTS.validateMiniMaxH3FirstLastRow,
  build: MODEL_CONTRACTS.buildMiniMaxH3FirstLastPayload
}
```

Add the corresponding `MULTI_VIDEO_MODELS.minimaxH3` entry using `maxRefs`, `validateMiniMaxH3MultiRow`, and `buildMiniMaxH3MultiPayload`.

Update row creation, normalization, and model-switch fallback logic to use `defaultSize`, `defaultQuality`, and `defaultDuration` when defined. Add `generateAudio` to image-to-video rows, render its checkbox only for capable models, and ignore audio-field writes for incapable models.

- [ ] **Step 4: Make prompt validation model-aware**

Change generic validation to require Prompt only when the current model does not declare `requiresPrompt: false`. Keep H3-specific input combinations in its shared validator:

```js
if (model.requiresPrompt !== false && !String(row.prompt || "").trim()) return "Prompt 不能为空";
```

Call each model validator after generic enum checks for image-to-video and before Seedance-specific checks for multimodal rows.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```powershell
node model-contracts.test.cjs
node runtime-behavior.test.cjs
node queue-refresh-resume.test.cjs
node history-recovery.test.cjs
```

Expected: all four scripts pass.

- [ ] **Step 6: Commit application integration**

```powershell
git add app.js model-contracts.test.cjs runtime-behavior.test.cjs
git commit -m "feat: expose MiniMax H3 video modes"
```

### Task 3: Regression and Local UI Verification

**Files:**
- Verify: `app.js`
- Verify: `model-contracts.js`
- Verify: `index.html`
- Verify: all `*.test.cjs`

**Interfaces:**
- Consumes: the existing company gateway request runner and query poller.
- Produces: a locally served UI where H3 is selectable in both required task pages without changing other model behavior.

- [ ] **Step 1: Run syntax and full regression tests**

Run:

```powershell
npm test
```

Expected: exit code 0, ending with the existing passing test messages and no syntax error.

- [ ] **Step 2: Inspect the final diff**

Run:

```powershell
git diff --check HEAD~2..HEAD
git status --short
```

Expected: no whitespace errors; only the two pre-existing untracked RunningHub auth files remain outside the H3 commits.

- [ ] **Step 3: Verify the local service without paid submission**

Check PM2 and HTTP:

```powershell
pm2 describe api-plus-webtools
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4198/
```

Expected: PM2 reports `online` and HTTP status is 200. Open the page and confirm:

- `图文生视频` includes `海螺 H3` with one `MiniMax H3` version.
- H3 shows ratios including `自动`, resolutions `768P/2K`, durations `5-15`, and an enabled-by-default sound checkbox.
- H3 enables first and last frame slots; an empty Prompt with a first frame is accepted by preflight validation.
- `多模态生视频` includes the same model and parameters, accepts mixed image/video/audio references, and limits the row to 12 references.
- Existing models still render their original controls.

- [ ] **Step 4: Record completion**

Do not trigger a real generation. Report the exact routes and automated verification results, plus the local URL:

```text
http://127.0.0.1:4198/?v=20260730-minimax-h3
```
