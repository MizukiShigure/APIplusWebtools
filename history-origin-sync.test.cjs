const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  browserOrigin,
  firstWriterMerge,
  fromControlRecord,
  legacyOrigin,
  matchesOrigin,
  normalizeOrigin,
  originKey,
  originLabel,
  toControlRecord
} = require("./history-origin-utils.js");

test("normalizes browser and Agent origins with a legacy fallback", () => {
  assert.deepEqual(normalizeOrigin(null), legacyOrigin());
  assert.deepEqual(
    browserOrigin("browser-01", "Editing PC"),
    { type: "browser", client: "web", id: "browser-01", label: "Editing PC" }
  );
  assert.deepEqual(
    normalizeOrigin({ type: "agent", client: "codex", id: "tasker-7", label: "Codex Studio" }),
    { type: "agent", client: "codex", id: "tasker-7", label: "Codex Studio" }
  );
});

test("merges duplicate history IDs with first-writer-wins semantics", () => {
  const merged = firstWriterMerge([
    [{ id: "same", prompt: "first", createdAt: 10 }],
    [{ id: "same", prompt: "later overwrite", createdAt: 20 }, { id: "next", createdAt: 15 }]
  ], item => item.id);

  assert.equal(merged.length, 2);
  assert.equal(merged.find(item => item.id === "same").prompt, "first");
  assert.deepEqual(merged.map(item => item.id), ["next", "same"]);
});

test("round-trips control history records without losing source metadata", () => {
  const source = {
    id: "gen-1",
    page: "imageVideo",
    prompt: "turn around",
    createdAt: 42,
    origin: { type: "agent", client: "minimax-code", id: "mm-1", label: "Minimax Code" },
    executedBy: { type: "browser", client: "web", id: "browser-01", label: "Editing PC" }
  };
  const control = toControlRecord(source, { kind: "generation", mediaType: "video" });

  assert.equal(control.recordId, "gen-1");
  assert.equal(control.kind, "generation");
  assert.equal(control.mediaType, "video");
  assert.deepEqual(control.origin, source.origin);
  assert.deepEqual(control.executedBy, source.executedBy);
  assert.deepEqual(fromControlRecord(control).id, "gen-1");
});

test("builds stable source keys, labels, and source filtering", () => {
  const origin = { type: "agent", client: "codex", id: "codex-local", label: "Codex" };
  const key = originKey(origin);

  assert.equal(key, "agent::codex::codex-local");
  assert.equal(originLabel(origin), "Codex");
  assert.equal(originLabel(null), "Legacy browser");
  assert.equal(matchesOrigin({ origin }, key), true);
  assert.equal(matchesOrigin({ origin }, "browser::web::other"), false);
  assert.equal(matchesOrigin({ origin }, "all"), true);
});

test("never converts an empty record into a control-history write", () => {
  assert.equal(toControlRecord(null, { kind: "generation" }), null);
  assert.equal(toControlRecord({}, { kind: "generation" }), null);
});
test("loads history origin utilities before the application", () => {
  const page = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(
    page,
    /history-origin-utils\.js[^>]*><\/script>\s*<script src="\.\/agent-task-adapter\.js[^>]*><\/script>[\s\S]*?<script src="\.\/app\.js/,
    "history origin utilities must be available before app.js"
  );
});
test("integrates incremental control history without empty snapshot writes", () => {
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert.match(app, /const HISTORY_ORIGIN_UTILS = globalThis\.ApiBatchHistoryOriginUtils;/);
  assert.match(app, /async function readControlHistoryRecords\(\)/);
  assert.match(app, /function scheduleControlHistoryAppend\(records\)/);
  assert.match(app, /if \(!normalized\.length\) return;/);
  assert.match(app, /await appendControlHistoryRecords\(migrationRecords\)[\s\S]*?historyJournalMigration/);
  assert.match(app, /HISTORY_ORIGIN_UTILS\.firstWriterMerge/);
});

test("preserves source metadata on uploads and generations", () => {
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert.match(app, /function currentBrowserOrigin\(\)/);
  assert.match(app, /function normalizeHistoryOrigin\(value/);
  assert.match(app, /function addUploadHistory\(asset\)[\s\S]*?origin:/);
  assert.match(app, /function addGenerationHistory\(record\)[\s\S]*?origin:/);
  assert.match(app, /function normalizeGenerations\(value\)[\s\S]*?agentTaskId:[\s\S]*?origin:[\s\S]*?executedBy:/);
});