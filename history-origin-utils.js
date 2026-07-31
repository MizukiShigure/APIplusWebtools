(function initHistoryOriginUtils(globalScope, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.ApiBatchHistoryOriginUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHistoryOriginUtils() {
  "use strict";

  const LEGACY_ORIGIN = Object.freeze({
    type: "browser",
    client: "web",
    id: "legacy-browser",
    label: "Legacy browser"
  });

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function legacyOrigin() {
    return { ...LEGACY_ORIGIN };
  }

  function browserOrigin(id, label) {
    return normalizeOrigin({
      type: "browser",
      client: "web",
      id: clean(id) || "local-browser",
      label: clean(label) || "Local browser"
    });
  }

  function normalizeOrigin(value, fallback = LEGACY_ORIGIN) {
    const candidate = value && typeof value === "object" ? value : fallback;
    const safeFallback = fallback && typeof fallback === "object" ? fallback : LEGACY_ORIGIN;
    return {
      type: clean(candidate?.type) || clean(safeFallback.type) || LEGACY_ORIGIN.type,
      client: clean(candidate?.client) || clean(safeFallback.client) || LEGACY_ORIGIN.client,
      id: clean(candidate?.id) || clean(safeFallback.id) || LEGACY_ORIGIN.id,
      label: clean(candidate?.label) || clean(safeFallback.label) || LEGACY_ORIGIN.label
    };
  }

  function originKey(value) {
    const origin = normalizeOrigin(value);
    return [origin.type, origin.client, origin.id].join("::");
  }

  function originLabel(value) {
    const origin = normalizeOrigin(value);
    return origin.label || origin.client || origin.id || LEGACY_ORIGIN.label;
  }

  function matchesOrigin(record, selectedKey) {
    const selected = clean(selectedKey) || "all";
    return selected === "all" || originKey(record?.origin) === selected;
  }

  function firstWriterMerge(lists, getKey) {
    const map = new Map();
    const groups = Array.isArray(lists) ? lists : [];
    groups.flat().forEach(item => {
      if (!item) return;
      const key = clean(getKey?.(item));
      if (!key || map.has(key)) return;
      map.set(key, item);
    });
    return Array.from(map.values()).sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
  }

  function toControlRecord(record, options = {}) {
    if (!record || typeof record !== "object") return null;
    const recordId = clean(record.recordId || record.id);
    if (!recordId) return null;
    const fallbackOrigin = options.fallbackOrigin || LEGACY_ORIGIN;
    const result = {
      ...record,
      recordId,
      kind: clean(options.kind || record.kind),
      mediaType: clean(options.mediaType || record.mediaType),
      origin: normalizeOrigin(record.origin, fallbackOrigin)
    };
    if (record.executedBy) result.executedBy = normalizeOrigin(record.executedBy, fallbackOrigin);
    return result;
  }

  function fromControlRecord(record) {
    if (!record || typeof record !== "object") return null;
    const id = clean(record.id || record.recordId);
    if (!id) return null;
    const result = {
      ...record,
      id,
      origin: normalizeOrigin(record.origin)
    };
    if (record.executedBy) result.executedBy = normalizeOrigin(record.executedBy);
    return result;
  }

  return {
    browserOrigin,
    firstWriterMerge,
    fromControlRecord,
    legacyOrigin,
    matchesOrigin,
    normalizeOrigin,
    originKey,
    originLabel,
    toControlRecord
  };
});
