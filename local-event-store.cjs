const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.promises.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tempFile, JSON.stringify(value, null, 2), "utf8");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.promises.rename(tempFile, file);
      return;
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt === 5) throw error;
      // Windows scanners can briefly hold a snapshot open. Retry only its atomic
      // replacement; never unlink the existing history or discard the candidate.
      await new Promise(resolve => setTimeout(resolve, 20 * (2 ** attempt)));
    }
  }
}

async function readJournal(file, { repairTail = false } = {}) {
  let bytes;
  try {
    bytes = await fs.promises.readFile(file);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const text = bytes.toString("utf8");
  const lines = text.split(/\r?\n/);
  const lastContentLine = lines.reduce((last, line, index) => line.trim() ? index : last, -1);
  const events = [];
  let interruptedTail = false;
  for (let index = 0; index <= lastContentLine; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      if (index === lines.length - 1 && !text.endsWith("\n") && !text.endsWith("\r")) {
        interruptedTail = true;
        break;
      }
      const wrapped = new Error(`Event journal corruption at line ${index + 1}: ${error.message}`);
      wrapped.cause = error;
      throw wrapped;
    }
  }
  if (repairTail && interruptedTail) {
    const tailOffset = bytes.lastIndexOf(0x0a) + 1;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const recoveryFile = `${file}.recovered-tail-${stamp}-${crypto.randomUUID()}.bin`;
    // Preserve the exact bytes, including an interrupted UTF-8 character. A failed
    // recovery copy must leave the original journal untouched for manual recovery.
    const recovery = await fs.promises.open(recoveryFile, "wx", 0o600);
    try {
      await recovery.writeFile(bytes.subarray(tailOffset));
      await recovery.sync();
    } finally {
      await recovery.close();
    }
    await fs.promises.truncate(file, tailOffset);
  } else if (repairTail && bytes.length && !text.endsWith("\n")) {
    // The final JSON object can be complete even if its newline was interrupted.
    // Separate it from the next event instead of joining two valid JSON objects.
    await fs.promises.appendFile(file, "\n", "utf8");
  }
  return events;
}

function createEventStore(options) {
  if (!options?.journalFile || !options?.snapshotFile) throw new Error("journalFile and snapshotFile are required");
  if (typeof options.initialState !== "function") throw new Error("initialState must be a function");
  if (typeof options.applyEvent !== "function") throw new Error("applyEvent must be a function");

  let state = options.initialState();
  let lastSequence = 0;
  let initialized = false;
  let writeQueue = Promise.resolve();
  const eventIds = new Set();
  const events = [];

  async function persistSnapshot() {
    await writeJsonAtomic(options.snapshotFile, {
      version: 1,
      updatedAt: new Date().toISOString(),
      lastSequence,
      eventIds: Array.from(eventIds),
      state
    });
  }

  async function init() {
    if (initialized) return;
    const snapshot = await readJson(options.snapshotFile);
    if (snapshot && snapshot.version === 1 && snapshot.state && Number.isFinite(Number(snapshot.lastSequence))) {
      state = snapshot.state;
      lastSequence = Number(snapshot.lastSequence || 0);
      for (const eventId of snapshot.eventIds || []) eventIds.add(String(eventId));
    }

    const journalEvents = await readJournal(options.journalFile, { repairTail: true });
    for (const raw of journalEvents) {
      if (!raw || typeof raw !== "object") continue;
      const event = { ...raw };
      const eventId = String(event.eventId || "");
      const sequence = Number(event.sequence || 0);
      if (!eventId || !Number.isFinite(sequence) || sequence <= 0) continue;
      events.push(event);
      eventIds.add(eventId);
      if (sequence <= lastSequence) continue;
      state = options.applyEvent(state, event);
      lastSequence = sequence;
    }
    initialized = true;
    if (journalEvents.some(event => Number(event?.sequence || 0) > Number(snapshot?.lastSequence || 0))) {
      await persistSnapshot();
    }
  }

  function append(rawEvent) {
    return appendMany([rawEvent]).then(results => results[0]);
  }

  function appendMany(rawEvents) {
    const operation = writeQueue.then(async () => {
      await init();
      const results = [];
      let applied = false;
      for (const rawEvent of rawEvents || []) {
        const eventId = String(rawEvent?.eventId || crypto.randomUUID());
        if (eventIds.has(eventId)) {
          const existing = events.find(item => item.eventId === eventId) || null;
          results.push({ applied: false, event: clone(existing) });
          continue;
        }
        const event = {
          ...clone(rawEvent || {}),
          eventId,
          sequence: lastSequence + 1,
          createdAt: rawEvent?.createdAt || new Date().toISOString()
        };
        await fs.promises.mkdir(path.dirname(options.journalFile), { recursive: true });
        await fs.promises.appendFile(options.journalFile, `${JSON.stringify(event)}\n`, "utf8");
        state = options.applyEvent(state, event);
        lastSequence = event.sequence;
        eventIds.add(eventId);
        events.push(event);
        applied = true;
        results.push({ applied: true, event: clone(event) });
      }
      // Every event reaches the journal before one final checkpoint for the batch.
      if (applied) await persistSnapshot();
      return results;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return {
    init,
    append,
    appendMany,
    // Selectors are synchronous, read-only projections; returned values stay detached.
    getState: (select = value => value) => clone(select(state)),
    getEvents: ({ afterSequence = 0 } = {}) => clone(events.filter(event => Number(event.sequence) > Number(afterSequence || 0))),
    getLastSequence: () => lastSequence
  };
}

function createHistoryState() {
  return {
    recordsById: {},
    recordOrder: [],
    favoritesById: {},
    deletedById: {},
    deletedResultsById: {}
  };
}

function applyHistoryEvent(currentState, event) {
  const state = currentState && typeof currentState === "object" ? clone(currentState) : createHistoryState();
  state.recordsById ||= {};
  state.recordOrder ||= [];
  state.favoritesById ||= {};
  state.deletedById ||= {};
  state.deletedResultsById ||= {};
  if (event?.type === "record-created") {
    const record = event.record && typeof event.record === "object" ? clone(event.record) : null;
    const recordId = String(record?.recordId || "");
    if (recordId && !state.recordsById[recordId]) {
      state.recordsById[recordId] = record;
      state.recordOrder.push(recordId);
    }
  } else if (event?.type === "favorite-set") {
    const recordId = String(event.recordId || "");
    if (recordId && state.recordsById[recordId]) state.favoritesById[recordId] = Boolean(event.favorite);
  } else if (event?.type === "record-results-deleted") {
    const recordId = String(event.recordId || "");
    if (recordId && state.recordsById[recordId]) {
      state.deletedResultsById[recordId] ||= {};
      (Array.isArray(event.results) ? event.results : []).forEach(result => {
        state.deletedResultsById[recordId][JSON.stringify(result)] = true;
      });
    }
  } else if (event?.type === "record-deleted") {
    const recordId = String(event.recordId || "");
    if (recordId && state.recordsById[recordId]) state.deletedById[recordId] = true;
  }
  return state;
}

function normalizeMediaType(value) {
  return ["image", "video", "audio", "other"].includes(value) ? value : "other";
}

function listHistoryRecords(currentState, options = {}) {
  const state = currentState || createHistoryState();
  const limit = Math.max(1, Number(options.retentionPerMediaType || 1000));
  const counts = {};
  const records = (state.recordOrder || [])
    .map(recordId => state.recordsById?.[recordId])
    .filter(record => record && !state.deletedById?.[record.recordId])
    .map(record => {
      const projected = clone(record);
      const deletedResults = state.deletedResultsById?.[record.recordId] || {};
      if (Array.isArray(projected.results)) {
        projected.results = projected.results.filter(result => !deletedResults[JSON.stringify(result)]);
      }
      return { ...projected, favorite: Boolean(state.favoritesById?.[record.recordId]) };
    })
    .filter(record => record.kind !== "generation" || !Array.isArray(record.results) || record.results.length > 0)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return records.filter(record => {
    if (record.favorite) return true;
    const mediaType = normalizeMediaType(record.mediaType);
    counts[mediaType] = (counts[mediaType] || 0) + 1;
    return counts[mediaType] <= limit;
  });
}

module.exports = {
  createEventStore,
  createHistoryState,
  applyHistoryEvent,
  listHistoryRecords,
  readJournal,
  writeJsonAtomic
};
