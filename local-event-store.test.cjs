const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createEventStore,
  createHistoryState,
  applyHistoryEvent,
  listHistoryRecords
} = require("./local-event-store.cjs");

async function tempStore(options = {}) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "api-plus-events-"));
  const journalFile = path.join(root, "events.ndjson");
  const snapshotFile = path.join(root, "snapshot.json");
  const store = createEventStore({
    journalFile,
    snapshotFile,
    initialState: options.initialState || (() => ({ values: [] })),
    applyEvent: options.applyEvent || ((state, event) => ({ values: [...state.values, event.value] }))
  });
  await store.init();
  return { root, journalFile, snapshotFile, store };
}

test("serializes concurrent appends and writes an atomic snapshot", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));

  await Promise.all(Array.from({ length: 24 }, (_, index) => fixture.store.append({
    eventId: `event-${index}`,
    type: "value-added",
    value: index
  })));

  const journalLines = (await fs.promises.readFile(fixture.journalFile, "utf8")).trim().split("\n");
  const snapshot = JSON.parse(await fs.promises.readFile(fixture.snapshotFile, "utf8"));
  assert.equal(journalLines.length, 24);
  assert.deepEqual(journalLines.map(line => JSON.parse(line).sequence), Array.from({ length: 24 }, (_, index) => index + 1));
  assert.equal(snapshot.lastSequence, 24);
  assert.equal(snapshot.state.values.length, 24);
  assert.equal(fs.existsSync(`${fixture.snapshotFile}.${process.pid}.tmp`), false);
});

test("treats an already-applied event id as an idempotent no-op", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));

  const first = await fixture.store.append({ eventId: "same", type: "value-added", value: "first" });
  const duplicate = await fixture.store.append({ eventId: "same", type: "value-added", value: "second" });

  assert.equal(first.applied, true);
  assert.equal(duplicate.applied, false);
  assert.deepEqual(fixture.store.getState(), { values: ["first"] });
  assert.equal((await fs.promises.readFile(fixture.journalFile, "utf8")).trim().split("\n").length, 1);
});

test("recovers events newer than the snapshot and ignores only a truncated final line", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  await fixture.store.append({ eventId: "one", type: "value-added", value: 1 });

  await fs.promises.appendFile(fixture.journalFile, `${JSON.stringify({
    eventId: "two",
    type: "value-added",
    value: 2,
    sequence: 2,
    createdAt: new Date().toISOString()
  })}\n{\"eventId\":\"truncated`, "utf8");

  const reopened = createEventStore({
    journalFile: fixture.journalFile,
    snapshotFile: fixture.snapshotFile,
    initialState: () => ({ values: [] }),
    applyEvent: (state, event) => ({ values: [...state.values, event.value] })
  });
  await reopened.init();

  assert.deepEqual(reopened.getState(), { values: [1, 2] });
  assert.equal(reopened.getLastSequence(), 2);
});

test("surfaces corruption before the final journal line", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  await fs.promises.writeFile(fixture.journalFile, "{broken}\n{also-broken}\n", "utf8");
  await fs.promises.rm(fixture.snapshotFile, { force: true });

  const reopened = createEventStore({
    journalFile: fixture.journalFile,
    snapshotFile: fixture.snapshotFile,
    initialState: () => ({ values: [] }),
    applyEvent: state => state
  });
  await assert.rejects(reopened.init(), /journal corruption at line 1/i);
});

test("history projection keeps the first record, applies favorites, and honors tombstones", () => {
  let state = createHistoryState();
  state = applyHistoryEvent(state, {
    type: "record-created",
    record: { recordId: "record-1", kind: "generation", mediaType: "image", prompt: "first", createdAt: 10 }
  });
  state = applyHistoryEvent(state, {
    type: "record-created",
    record: { recordId: "record-1", kind: "generation", mediaType: "image", prompt: "overwrite", createdAt: 20 }
  });
  state = applyHistoryEvent(state, { type: "favorite-set", recordId: "record-1", favorite: true });

  assert.equal(listHistoryRecords(state)[0].prompt, "first");
  assert.equal(listHistoryRecords(state)[0].favorite, true);

  state = applyHistoryEvent(state, { type: "record-deleted", recordId: "record-1" });
  assert.deepEqual(listHistoryRecords(state), []);
});

test("history retention is independent per media type and preserves favorites", () => {
  let state = createHistoryState();
  for (const [index, mediaType] of ["image", "image", "image", "video", "video"].entries()) {
    state = applyHistoryEvent(state, {
      type: "record-created",
      record: {
        recordId: `record-${index}`,
        kind: "generation",
        mediaType,
        createdAt: index + 1
      }
    });
  }
  state = applyHistoryEvent(state, { type: "favorite-set", recordId: "record-0", favorite: true });

  const records = listHistoryRecords(state, { retentionPerMediaType: 2 });
  assert.deepEqual(records.map(record => record.recordId), ["record-4", "record-3", "record-2", "record-1", "record-0"]);
});

test("history projection can tombstone individual generated results", () => {
  let state = createHistoryState();
  state = applyHistoryEvent(state, {
    type: "record-created",
    record: {
      recordId: "record-many",
      kind: "generation",
      mediaType: "image",
      results: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
      createdAt: 10
    }
  });
  state = applyHistoryEvent(state, {
    type: "record-results-deleted",
    recordId: "record-many",
    results: ["https://cdn.example/a.png"]
  });

  assert.deepEqual(listHistoryRecords(state)[0].results, ["https://cdn.example/b.png"]);
});
