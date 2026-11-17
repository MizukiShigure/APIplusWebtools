(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PromptLibrary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const TASK_TYPES = Object.freeze(["image", "imageVideo", "motion", "avatar", "multiVideo", "viduRef"]);
  const HISTORY_LIMIT = 1000;
  const MAX_TEXT_LENGTH = 32768;
  const clone = value => JSON.parse(JSON.stringify(value));

  function invalid(message) {
    return Object.assign(new Error(message), { status: 400 });
  }

  function validateTaskType(taskType) {
    if (!TASK_TYPES.includes(taskType)) throw invalid("Invalid prompt library task type");
    return taskType;
  }

  function normalizePrompt(text) {
    if (typeof text !== "string") throw invalid("Prompt must be text");
    return text.replace(/\r\n?/g, "\n").trim();
  }

  async function keyFor(taskType, text) {
    validateTaskType(taskType);
    const normalized = normalizePrompt(text);
    if (!normalized || normalized.length > MAX_TEXT_LENGTH) throw invalid("Prompt is empty or too long");
    if (!root.crypto?.subtle) throw new Error("Web Crypto is required for prompt keys");
    const bytes = new TextEncoder().encode(JSON.stringify([taskType, normalized]));
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return `${taskType}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  function timestamp(value, name, fallback) {
    const result = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(result) || result < 0) throw invalid(`Invalid ${name}`);
    return result;
  }

  async function normalizeEvent(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid("Invalid prompt event");
    if (typeof raw.id !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(raw.id)) throw invalid("Invalid event id");
    if (!["record", "favorite"].includes(raw.kind)) throw invalid("Invalid prompt event kind");
    const taskType = validateTaskType(raw.taskType);
    const text = normalizePrompt(raw.text);
    const key = await keyFor(taskType, text);
    if (raw.key !== undefined && raw.key !== key) throw invalid("Prompt key mismatch");
    const event = { id: raw.id, kind: raw.kind, taskType, key, text };
    if (raw.kind === "record" || raw.usedAt !== undefined) {
      event.usedAt = timestamp(raw.usedAt, "usedAt", 0);
      if (raw.model !== undefined && (typeof raw.model !== "string" || raw.model.length > 256)) throw invalid("Invalid model");
      if (raw.imported !== undefined && typeof raw.imported !== "boolean") throw invalid("Invalid imported flag");
      event.model = (raw.model || "").trim();
      event.imported = raw.imported === true;
    }
    if (raw.kind === "favorite") {
      if (typeof raw.favorite !== "boolean") throw invalid("Invalid favorite flag");
      event.favorite = raw.favorite;
      event.changedAt = timestamp(raw.changedAt, "changedAt", 0);
    }
    return event;
  }

  function createState() {
    return { entries: {}, clocks: {} };
  }

  function compareEntries(a, b) {
    return b.usedAt - a.usedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }

  function prune(state, taskType) {
    const entries = Object.values(state.entries).filter(entry => entry.taskType === taskType && !entry.favorite).sort(compareEntries);
    for (const entry of entries.slice(HISTORY_LIMIT)) delete state.entries[entry.key];
  }

  // Record recency and favorite choice are separate registers. Retained favorite
  // clocks prevent an acknowledged-but-retried event resurrecting a pruned item.
  function applyEvent(state, event, options = {}) {
    const { key, taskType } = event;
    let entry = state.entries[key];
    if (!entry) {
      entry = { key, taskType, text: event.text, usedAt: 0, model: "", imported: false,
        favorite: false, _hasUsage: false, _recordId: "" };
      if (event.kind === "favorite" && event.usedAt !== undefined) {
        Object.assign(entry, { usedAt: event.usedAt, model: event.model, imported: event.imported, _hasUsage: true });
      }
      state.entries[key] = entry;
    }
    if (event.kind === "record") {
      entry.imported = entry._hasUsage ? entry.imported && event.imported : event.imported;
      if (!entry._hasUsage || event.usedAt > entry.usedAt || (event.usedAt === entry.usedAt && event.id > entry._recordId)) {
        entry.usedAt = event.usedAt;
        entry.model = event.model;
        entry._recordId = event.id;
      }
      entry._hasUsage = true;
    } else {
      const previous = state.clocks[key];
      if (!previous || event.changedAt > previous.changedAt || (event.changedAt === previous.changedAt && event.id > previous.id)) {
        state.clocks[key] = { changedAt: event.changedAt, id: event.id, favorite: event.favorite };
      }
    }
    const clock = state.clocks[key];
    entry.favorite = clock?.favorite === true;
    if (clock) entry._favoriteClock = { ...clock };
    if (options.prune !== false) prune(state, taskType);
    return state;
  }

  function searchEntries(entries, query = "") {
    const words = String(query).toLowerCase().trim().split(/\s+/u).filter(Boolean);
    return entries.filter(entry => words.every(word => entry.text.toLowerCase().includes(word)));
  }

  function getEntries(state, taskType, options = {}) {
    validateTaskType(taskType);
    const entries = Object.values(state.entries).filter(entry => entry.taskType === taskType && (!options.favoriteOnly || entry.favorite));
    return searchEntries(entries, options.search ?? options.query ?? "").sort(compareEntries).map(entry => ({ ...entry,
      ...(entry._favoriteClock ? { _favoriteClock: { ...entry._favoriteClock } } : {}) }));
  }

  function createIndexedDBStorage(indexedDB, dbName) {
    let database;
    const opened = new Promise((resolve, reject) => {
      if (!indexedDB) return reject(new Error("IndexedDB is unavailable; prompts cannot be saved durably"));
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ["entries", "outbox", "meta"]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === "entries" ? "key" : "id" });
        }
      };
      request.onerror = () => reject(request.error || new Error("Cannot open prompt IndexedDB"));
      request.onblocked = () => reject(new Error("Prompt IndexedDB upgrade is blocked by another tab"));
      request.onsuccess = () => {
        database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });

    async function transaction(update, metadataOnly = false) {
      const db = await opened;
      return new Promise((resolve, reject) => {
        const mode = update ? "readwrite" : "readonly";
        const stores = metadataOnly ? ["outbox", "meta"] : ["entries", "outbox", "meta"];
        let tx;
        try { tx = db.transaction(stores, mode, { durability: "strict" }); }
        catch { tx = db.transaction(stores, mode); }
        let result;
        let failure;
        const reads = {};
        let pending = stores.length;
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("Prompt IndexedDB transaction failed"));
        for (const name of stores) {
          const syncOnly = metadataOnly && name === "meta";
          const request = syncOnly ? tx.objectStore(name).get("sync") : tx.objectStore(name).getAll();
          request.onsuccess = () => {
            reads[name] = syncOnly ? (request.result ? [request.result] : []) : request.result;
            if (--pending) return;
            try {
              const metadata = reads.meta.find(item => item.id === "state") || {};
              const sync = reads.meta.find(item => item.id === "sync") || metadata;
              result = { outbox: reads.outbox, imports: metadata.imports || [], cacheVersion: sync.cacheVersion || 0,
                serverRevision: sync.serverRevision ?? null, acknowledgedRevision: sync.acknowledgedRevision ?? null,
                acknowledgedTypes: sync.acknowledgedTypes };
              if (metadataOnly) return;
              result.state = { entries: Object.fromEntries(reads.entries.map(entry => [entry.key, entry])), clocks: metadata.clocks || {} };
              if (!update) return;
              const before = clone(result);
              update(result);
              const reconcile = (name, oldItems, newItems, field) => {
                const store = tx.objectStore(name);
                const previous = new Map(oldItems.map(item => [item[field], JSON.stringify(item)]));
                for (const item of newItems) {
                  if (previous.get(item[field]) !== JSON.stringify(item)) store.put(item);
                  previous.delete(item[field]);
                }
                for (const key of previous.keys()) store.delete(key);
              };
              reconcile("entries", Object.values(before.state.entries), Object.values(result.state.entries), "key");
              reconcile("outbox", before.outbox, result.outbox, "id");
              tx.objectStore("meta").put({ id: "state", clocks: result.state.clocks, imports: result.imports });
              tx.objectStore("meta").put({ id: "sync", cacheVersion: result.cacheVersion, serverRevision: result.serverRevision,
                acknowledgedRevision: result.acknowledgedRevision, acknowledgedTypes: result.acknowledgedTypes });
            } catch (error) { failure = error; tx.abort(); }
          };
        }
      });
    }

    return { read: () => transaction(), readSync: () => transaction(undefined, true),
      update: fn => transaction(fn), close: () => { opened.then(db => db.close(), () => {}); } };
  }

  function createClient(options = {}) {
    const storage = options.storage || createIndexedDBStorage(
      options.indexedDB === undefined ? root.indexedDB : options.indexedDB,
      options.dbName || "api_console_prompt_library_db_v1"
    );
    const fetcher = options.fetch || root.fetch?.bind(root);
    const baseUrl = options.baseUrl || "/api/prompt-library";
    if (!/^\/(?!\/)/.test(baseUrl)) throw invalid("Prompt library URL must be same-origin");
    const listeners = new Set();
    const autoSync = options.autoSync !== false;
    const retryMs = options.retryMs || 1000;
    const refreshMs = options.refreshMs || 30000;
    const now = options.now || Date.now;
    let state = createState();
    let timer;
    let closed = false;
    let syncing;
    let failures = 0;
    let lastError = null;
    let needsSync = false;
    let favoriteTime = 0;
    let channel;
    let cacheVersion = -1;
    let serverRevision = null;
    let acknowledgedTypes = [];

    function knownTypes(data) {
      if (Array.isArray(data.acknowledgedTypes)) return data.acknowledgedTypes;
      if (!data.state) return acknowledgedTypes;
      // Older caches have no sync metadata. A record absent from the durable
      // outbox has already been acknowledged or downloaded from the server.
      const pendingIds = new Set(data.outbox.map(event => event.id));
      return [...new Set(Object.values(data.state.entries).filter(entry =>
        (entry._recordId && !pendingIds.has(entry._recordId)) ||
        (entry._favoriteClock && !pendingIds.has(entry._favoriteClock.id))
      ).map(entry => entry.taskType))];
    }

    function updateData(change) {
      return storage.update(data => {
        data.acknowledgedTypes = knownTypes(data);
        if (change(data) !== false) data.cacheVersion = (data.cacheVersion || 0) + 1;
      });
    }

    function publishData(data, reason) {
      const version = data.cacheVersion || 0;
      if (version <= cacheVersion) return;
      serverRevision = data.serverRevision ?? null;
      acknowledgedTypes = knownTypes(data);
      cacheVersion = version;
      publish(data.state, reason);
    }

    async function refreshLocal() {
      const data = await (storage.readSync ? storage.readSync() : storage.read());
      if ((data.cacheVersion || 0) !== cacheVersion) {
        const full = data.state ? data : await storage.read();
        publishData(full, "local");
        return full;
      }
      return data;
    }

    function validateRemote(remote, data) {
      if (!remote) return;
      const types = new Set(Object.values(remote.state.entries).map(entry => entry.taskType));
      if (knownTypes(data).some(taskType => !types.has(taskType))) {
        throw new Error("Prompt server is unexpectedly empty; acknowledged local prompts were retained");
      }
    }

    function publish(next, reason) {
      const taskTypes = TASK_TYPES.filter(taskType => JSON.stringify(getEntries(state, taskType)) !== JSON.stringify(getEntries(next, taskType)));
      state = clone(next);
      for (const value of Object.values(state.clocks)) favoriteTime = Math.max(favoriteTime, value.changedAt);
      if (!taskTypes.length || closed) return;
      for (const listener of listeners) {
        try { listener({ taskTypes, reason }); } catch { /* UI subscribers cannot invalidate a durable commit. */ }
      }
    }

    function schedule(delay = 0) {
      if (!autoSync || closed) return;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; client.sync().catch(() => {}); }, delay);
      timer?.unref?.();
    }

    async function request(url, init = {}) {
      if (!fetcher) throw new Error("Fetch is unavailable");
      const config = { ...init, credentials: "same-origin", cache: "no-store" };
      const invoke = async (target, settings) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs || 15000);
        timeout?.unref?.();
        try { return await fetcher(target, { ...settings, signal: controller.signal }); }
        finally { clearTimeout(timeout); }
      };
      let response = await invoke(url, config);
      if (response.status === 401) {
        const session = await invoke("/api/control/v1/session", { credentials: "same-origin", cache: "no-store" });
        if (!session.ok) throw new Error(`Prompt session failed (HTTP ${session.status})`);
        response = await invoke(url, config);
      }
      if (!response.ok) throw new Error(`Prompt library request failed (HTTP ${response.status})`);
      const body = await response.json();
      if (body.success !== true) throw new Error("Invalid prompt library response");
      return body;
    }

    async function fetchState(sinceRevision = serverRevision, minimumRevision = sinceRevision ?? 0) {
      // Revision checks avoid silently skipping items while another browser
      // inserts a recent prompt between pagination requests.
      for (let attempt = 0; attempt < 3; attempt++) {
        const next = createState();
        let revision;
        let changed = false;
        for (const taskType of TASK_TYPES) {
          let offset = 0;
          do {
            const conditional = attempt === 0 && taskType === TASK_TYPES[0] && offset === 0 && sinceRevision !== null;
            const page = await request(`${baseUrl}?taskType=${taskType}&limit=100&offset=${offset}${conditional ? `&sinceRevision=${sinceRevision}` : ""}`);
            if (!Number.isSafeInteger(page.revision) || page.revision < 0) throw new Error("Invalid prompt library revision");
            if (page.revision < minimumRevision) throw new Error("Prompt server revision moved backwards; local prompts were retained");
            if (page.unchanged === true) {
              if (!conditional || page.revision !== sinceRevision) throw new Error("Invalid unchanged prompt revision");
              return null;
            }
            if (!Array.isArray(page.entries)) throw new Error("Invalid prompt library page");
            if (revision === undefined) revision = page.revision;
            if (revision !== page.revision) { changed = true; break; }
            for (const entry of page.entries) {
              if (entry.taskType !== taskType || typeof entry.text !== "string" || entry.key !== await keyFor(taskType, entry.text)) {
                throw new Error("Invalid prompt library entry");
              }
              next.entries[entry.key] = clone(entry);
              if (entry._favoriteClock) next.clocks[entry.key] = clone(entry._favoriteClock);
            }
            if (page.nextOffset !== null && (!Number.isSafeInteger(page.nextOffset) || page.nextOffset <= offset)) throw new Error("Invalid prompt library pagination");
            offset = page.nextOffset;
          } while (offset !== null);
          if (changed) break;
        }
        if (!changed) return { state: next, revision };
      }
      throw new Error("Prompt library changed during loading; retrying later");
    }

    async function persist(events, importId) {
      await client.ready;
      if (closed) throw new Error("Prompt library client is closed");
      let count = 0;
      const updated = await updateData(data => {
        if (importId && data.imports.includes(importId)) return;
        for (const event of events) {
          data.outbox.push(event);
          applyEvent(data.state, event, { prune: false });
          count++;
        }
        for (const taskType of TASK_TYPES) prune(data.state, taskType);
        if (importId) data.imports.push(importId);
      });
      publishData(updated, importId ? "import" : "local");
      if (count) { needsSync = true; channel?.postMessage("changed"); schedule(); }
      return count;
    }

    const client = {
      ready: null,
      getEntries: (taskType, settings) => getEntries(state, taskType, settings),
      get lastError() { return lastError; },
      onChange(listener) {
        if (typeof listener !== "function") throw new TypeError("Expected change listener");
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async record(taskType, text, settings = {}) {
        const event = await normalizeEvent({ id: root.crypto.randomUUID(), kind: "record", taskType, text,
          usedAt: settings.usedAt === undefined ? now() : settings.usedAt, model: settings.model, imported: settings.imported });
        await persist([event]);
        return getEntries(state, taskType).find(entry => entry.key === event.key) || null;
      },
      async setFavorite(taskType, key, favorite) {
        validateTaskType(taskType);
        await client.ready;
        const latest = await storage.read();
        const entry = latest.state.entries[key];
        if (!entry || entry.taskType !== taskType) throw invalid("Prompt entry was not found");
        favoriteTime = Math.max(now(), favoriteTime + 1, (latest.state.clocks[key]?.changedAt || 0) + 1);
        const event = await normalizeEvent({ id: root.crypto.randomUUID(), kind: "favorite", taskType,
          key, text: entry.text, favorite, changedAt: favoriteTime,
          ...(entry._hasUsage ? { usedAt: entry.usedAt, model: entry.model, imported: entry.imported } : {}) });
        await persist([event]);
        return getEntries(state, taskType).find(item => item.key === key) || null;
      },
      async importOnce(importId, records) {
        if (typeof importId !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(importId) || !Array.isArray(records)) throw invalid("Invalid prompt import");
        await client.ready;
        if ((await storage.read()).imports.includes(importId)) return 0;
        const events = [];
        for (const record of records) {
          events.push(await normalizeEvent({ id: root.crypto.randomUUID(), kind: "record", taskType: record.taskType,
            text: record.text, usedAt: record.usedAt === undefined ? 0 : record.usedAt, model: record.model, imported: true }));
        }
        return persist(events, importId);
      },
      sync() {
        if (syncing) return syncing;
        syncing = (async () => {
          await client.ready;
          if (closed) throw new Error("Prompt library client is closed");
          needsSync = false;
          let pending = await refreshLocal();
          if (pending.outbox.length && knownTypes(pending).length) {
            const preflight = await fetchState(pending.acknowledgedRevision ?? serverRevision);
            validateRemote(preflight, pending);
          }
          while (pending.outbox.length && !closed) {
            const events = pending.outbox.slice(0, 20);
            const result = await request(`${baseUrl}/events`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events })
            });
            if (!Array.isArray(result.accepted) || !events.every(event => result.accepted.includes(event.id))) throw new Error("Prompt events were not acknowledged");
            const accepted = new Set(events.map(event => event.id));
            pending = await updateData(data => {
              data.outbox = data.outbox.filter(event => !accepted.has(event.id));
              data.acknowledgedTypes = [...new Set([...data.acknowledgedTypes, ...events.map(event => event.taskType)])];
              if (Number.isSafeInteger(result.revision)) data.acknowledgedRevision = Math.max(data.acknowledgedRevision ?? 0, result.revision);
            });
            publishData(pending, "local");
          }
          if (closed) return;
          const remote = await fetchState(serverRevision, Math.max(serverRevision ?? 0, pending.acknowledgedRevision ?? 0));
          if (remote) {
            const updated = await updateData(data => {
              // Another tab may have acknowledged an edit after our last page
              // was read. Never replace that newer cache with an older snapshot.
              if (remote.revision < Math.max(data.serverRevision ?? 0, data.acknowledgedRevision ?? 0)) {
                needsSync = true;
                return false;
              }
              validateRemote(remote, data);
              data.state = remote.state;
              data.serverRevision = remote.revision;
              data.acknowledgedTypes = [...new Set([...data.acknowledgedTypes, ...Object.values(remote.state.entries).map(entry => entry.taskType)])];
              data.acknowledgedRevision = remote.revision;
              for (const event of data.outbox) applyEvent(data.state, event, { prune: false });
              for (const taskType of TASK_TYPES) prune(data.state, taskType);
            });
            publishData(updated, "sync");
          }
          await refreshLocal();
          lastError = null;
          failures = 0;
        })().catch(error => {
          lastError = error;
          failures++;
          try { options.onError?.(error); } catch {}
          throw error;
        }).finally(() => {
          syncing = undefined;
          schedule(failures ? Math.min(retryMs * Math.pow(2, Math.min(failures - 1, 6)), 30000) : needsSync ? 0 : refreshMs);
        });
        return syncing;
      },
      close() {
        closed = true;
        clearTimeout(timer);
        root.removeEventListener?.("online", onOnline);
        root.removeEventListener?.("focus", onOnline);
        channel?.close();
        listeners.clear();
        if (syncing) syncing.catch(() => {}).finally(() => storage.close?.());
        else storage.close?.();
      }
    };
    function onOnline() { schedule(); }
    client.ready = storage.read().then(data => {
      publishData(data, "ready");
      if (!closed) {
        root.addEventListener?.("online", onOnline);
        root.addEventListener?.("focus", onOnline);
        if (root.document && root.BroadcastChannel) {
          channel = new root.BroadcastChannel(options.dbName || "api_console_prompt_library_db_v1");
          channel.onmessage = () => {
            refreshLocal().catch(() => {});
            schedule();
          };
        }
        schedule();
      }
      return client;
    });
    return client;
  }

  return { TASK_TYPES, HISTORY_LIMIT, MAX_TEXT_LENGTH, normalizePrompt, keyFor, normalizeEvent,
    createState, applyEvent, searchEntries, getEntries, createIndexedDBStorage, createClient };
});
