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
  await fs.promises.rename(tempFile, file);
}

async function readJournal(file) {
  let text = "";
  try {
    text = await fs.promises.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const lines = text.split(/\r?\n/);
  const lastContentLine = lines.reduce((last, line, index) => line.trim() ? index : last, -1);
  const events = [];
  for (let index = 0; index <= lastContentLine; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      if (index === lastContentLine && !text.endsWith("\n") && !text.endsWith("\r")) break;
      const wrapped = new Error(`Event journal corruption at line ${index + 1}: ${error.message}`);
      wrapped.cause = error;
      throw wrapped;
    }
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

    const journalEvents = await readJournal(options.journalFile);
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
    const operation = writeQueue.then(async () => {
      await init();
      const eventId = String(rawEvent?.eventId || crypto.randomUUID());
      if (eventIds.has(eventId)) {
        const existing = events.find(item => item.eventId === eventId) || null;
        return { applied: false, event: clone(existing) };
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
      await persistSnapshot();
      return { applied: true, event: clone(event) };
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function appendMany(rawEvents) {
    const results = [];
    for (const event of rawEvents || []) results.push(await append(event));
    return results;
  }

  return {
    init,
    append,
    appendMany,
    getState: () => clone(state),
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

