const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createEventStore,
  createHistoryState,
  applyHistoryEvent,
  listHistoryRecords,
  writeJsonAtomic
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

test("atomic JSON replacement retries temporary Windows locks without removing the old snapshot", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  const rename = fs.promises.rename;
  for (const code of ["EPERM", "EACCES", "EBUSY"]) {
    await fs.promises.writeFile(fixture.snapshotFile, '{"state":"old"}', "utf8");
    let attempts = 0;
    const replacement = t.mock.method(fs.promises, "rename", async (from, to) => {
      attempts += 1;
      if (attempts < 3) {
        assert.equal(await fs.promises.readFile(to, "utf8"), '{"state":"old"}');
        throw Object.assign(new Error("temporary Windows file lock"), { code });
      }
      return rename(from, to);
    });
    await writeJsonAtomic(fixture.snapshotFile, { state: "new", code });
    replacement.mock.restore();
    assert.equal(attempts, 3);
    assert.deepEqual(JSON.parse(await fs.promises.readFile(fixture.snapshotFile, "utf8")), { state: "new", code });
    assert.equal(fs.existsSync(`${fixture.snapshotFile}.${process.pid}.tmp`), false);
  }
});

test("persistent replacement locks stop after bounded retries and preserve both original and candidate", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  const original = '{"history":"keep"}';
  await fs.promises.writeFile(fixture.snapshotFile, original, "utf8");
  let attempts = 0;
  t.mock.method(fs.promises, "rename", async () => {
    attempts += 1;
    throw Object.assign(new Error("persistent Windows file lock"), { code: "EPERM" });
  });
  await assert.rejects(writeJsonAtomic(fixture.snapshotFile, { history: "candidate" }), { code: "EPERM" });
  assert.equal(attempts, 6);
  assert.equal(await fs.promises.readFile(fixture.snapshotFile, "utf8"), original);
  assert.deepEqual(JSON.parse(await fs.promises.readFile(`${fixture.snapshotFile}.${process.pid}.tmp`, "utf8")), { history: "candidate" });
});

test("atomic JSON replacement surfaces non-transient errors without retrying", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  await fs.promises.writeFile(fixture.snapshotFile, '{"history":"keep"}', "utf8");
  let attempts = 0;
  t.mock.method(fs.promises, "rename", async () => {
    attempts += 1;
    throw Object.assign(new Error("disk failure"), { code: "ENOSPC" });
  });
  await assert.rejects(writeJsonAtomic(fixture.snapshotFile, { history: "candidate" }), { code: "ENOSPC" });
  assert.equal(attempts, 1);
  assert.equal(await fs.promises.readFile(fixture.snapshotFile, "utf8"), '{"history":"keep"}');
});

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

test("batches snapshots without dropping ordered or duplicate journal events", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  const rename = fs.promises.rename;
  let snapshots = 0;
  t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to === fixture.snapshotFile) snapshots += 1;
    return rename(from, to);
  });
  const results = await fixture.store.appendMany([
    { eventId: "batch-1", value: 1 },
    { eventId: "batch-1", value: "must not overwrite" },
    { eventId: "batch-2", value: 2 }
  ]);
  const beforeEmpty = await fs.promises.readFile(fixture.snapshotFile, "utf8");
  await fixture.store.appendMany([]);
  await fixture.store.appendMany([{ eventId: "batch-2", value: "must not overwrite" }]);
  assert.equal(await fs.promises.readFile(fixture.snapshotFile, "utf8"), beforeEmpty);
  assert.deepEqual(results.map(result => result.applied), [true, false, true]);
  assert.deepEqual(fixture.store.getEvents().map(event => event.sequence), [1, 2]);
  assert.deepEqual(JSON.parse(beforeEmpty).state.values, [1, 2]);
  t.diagnostic(`batch metric: unique_events=2 snapshots=${snapshots}`);
  assert.equal(snapshots, 1);
});

test("selects detached state without cloning unrelated records", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  await fixture.store.append({ eventId: "selected", value: { id: 1 } });
  const selected = fixture.store.getState(state => state.values[0]);
  assert.deepEqual(selected, { id: 1 });
  selected.id = 2;
  assert.deepEqual(fixture.store.getState(), { values: [{ id: 1 }] });
  assert.equal(fixture.store.getState(state => state.missing), undefined);
});

test("recovers a durable batch after its snapshot fails without overwriting history", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  await fixture.store.append({ eventId: "before-batch", value: "original" });
  const previousSnapshot = await fs.promises.readFile(fixture.snapshotFile, "utf8");
  const prefix = await fs.promises.readFile(fixture.journalFile, "utf8");
  const rename = fs.promises.rename;
  const failure = t.mock.method(fs.promises, "rename", async (from, to) => {
    if (to === fixture.snapshotFile) throw new Error("synthetic snapshot failure");
    return rename(from, to);
  });
  await assert.rejects(fixture.store.appendMany([
    { eventId: "durable-1", value: "first" },
    { eventId: "durable-2", value: "second" }
  ]), /synthetic snapshot failure/);
  failure.mock.restore();
  assert.equal(await fs.promises.readFile(fixture.snapshotFile, "utf8"), previousSnapshot);
  assert.ok((await fs.promises.readFile(fixture.journalFile, "utf8")).startsWith(prefix));
  const reopened = createEventStore({
    journalFile: fixture.journalFile, snapshotFile: fixture.snapshotFile,
    initialState: () => ({ values: [] }),
    applyEvent: (state, event) => ({ values: [...state.values, event.value] })
  });
  await reopened.init();
  assert.deepEqual(reopened.getState().values, ["original", "first", "second"]);
  assert.equal((await reopened.append({ eventId: "durable-1", value: "replacement" })).applied, false);
  assert.deepEqual(reopened.getEvents().map(event => event.sequence), [1, 2, 3]);
});

test("serializes concurrent batches with individual appends", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  await fixture.store.appendMany([]);
  assert.equal(fs.existsSync(fixture.snapshotFile), false);
  await Promise.all([
    fixture.store.appendMany([{ eventId: "one", value: 1 }, { eventId: "two", value: 2 }]),
    fixture.store.append({ eventId: "three", value: 3 }),
    fixture.store.appendMany([{ eventId: "four", value: 4 }, { eventId: "five", value: 5 }])
  ]);
  assert.deepEqual(fixture.store.getState().values, [1, 2, 3, 4, 5]);
  assert.deepEqual(fixture.store.getEvents().map(event => event.sequence), [1, 2, 3, 4, 5]);
  assert.equal(JSON.parse(await fs.promises.readFile(fixture.snapshotFile, "utf8")).lastSequence, 5);
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

test("archives an interrupted journal tail before allowing durable new appends", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  await fixture.store.append({ eventId: "before-crash", value: "original" });
  const original = await fs.promises.readFile(fixture.journalFile);
  const interrupted = Buffer.concat([Buffer.from('{"eventId":"unfinished","value":"'), Buffer.from([0xe4, 0xb8])]);
  await fs.promises.appendFile(fixture.journalFile, interrupted);
  const reopen = () => createEventStore({
    journalFile: fixture.journalFile, snapshotFile: fixture.snapshotFile,
    initialState: () => ({ values: [] }),
    applyEvent: (state, event) => ({ values: [...state.values, event.value] })
  });
  const recovered = reopen();
  await recovered.init();
  await recovered.append({ eventId: "after-crash", value: "new" });
  const again = reopen();
  await again.init();
  assert.deepEqual(again.getState(), { values: ["original", "new"] });
  const backups = (await fs.promises.readdir(fixture.root)).filter(name => name.startsWith("events.ndjson.recovered-tail-"));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /recovered-tail-\d{4}-\d{2}-\d{2}T.*\.bin$/);
  assert.deepEqual(await fs.promises.readFile(path.join(fixture.root, backups[0])), interrupted);
  assert.ok((await fs.promises.readFile(fixture.journalFile)).subarray(0, original.length).equals(original));
});

test("separates a complete final event without a newline before the next append", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  const first = { eventId: "complete", value: 1, sequence: 1 };
  await fs.promises.writeFile(fixture.journalFile, JSON.stringify(first), "utf8");
  const options = {
    journalFile: fixture.journalFile, snapshotFile: fixture.snapshotFile,
    initialState: () => ({ values: [] }),
    applyEvent: (state, event) => ({ values: [...state.values, event.value] })
  };
  const reopened = createEventStore(options);
  await reopened.init();
  await reopened.append({ eventId: "next", value: 2 });
  const again = createEventStore(options);
  await again.init();
  assert.deepEqual(again.getState().values, [1, 2]);
});

test("never truncates a tail when its recovery copy cannot be saved", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  await fixture.store.append({ eventId: "complete", value: 1 });
  await fs.promises.appendFile(fixture.journalFile, '{"eventId":"unfinished', "utf8");
  const original = await fs.promises.readFile(fixture.journalFile);
  const open = fs.promises.open;
  t.mock.method(fs.promises, "open", async (file, ...args) => {
    if (String(file).includes(".recovered-tail-")) throw new Error("recovery copy denied");
    return open(file, ...args);
  });
  const reopened = createEventStore({
    journalFile: fixture.journalFile, snapshotFile: fixture.snapshotFile,
    initialState: () => ({ values: [] }), applyEvent: state => state
  });
  await assert.rejects(reopened.init(), /recovery copy denied/);
  assert.deepEqual(await fs.promises.readFile(fixture.journalFile), original);
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

test("does not treat a terminated corrupt line followed by whitespace as an interrupted tail", async t => {
  const fixture = await tempStore();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));
  const original = "{broken}\n   ";
  await fs.promises.writeFile(fixture.journalFile, original, "utf8");
  const reopened = createEventStore({
    journalFile: fixture.journalFile, snapshotFile: fixture.snapshotFile,
    initialState: () => ({ values: [] }), applyEvent: state => state
  });
  await assert.rejects(reopened.init(), /journal corruption at line 1/i);
  assert.equal(await fs.promises.readFile(fixture.journalFile, "utf8"), original);
  assert.equal((await fs.promises.readdir(fixture.root)).some(name => name.includes(".recovered-tail-")), false);
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
