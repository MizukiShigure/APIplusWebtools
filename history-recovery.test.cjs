const fs = require("fs");

const app = fs.readFileSync("app.js", "utf8");
const bridge = fs.readFileSync("history-bridge.html", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(app.includes("function recoverHistoryFromBrowserStorage"), "missing browser storage recovery function");
assert(app.includes("function importHistoryFromLegacyPort"), "missing legacy port import function");
assert(app.includes("function requestLegacyHistoryBridge"), "missing legacy bridge requester");
assert(app.includes("function loadHistoryRecoveryCandidates"), "missing recovery candidate scanner");
assert(app.includes("id=\"recoverHistoryStorage\""), "missing recover history button");
assert(app.includes("id=\"importLegacy4173History\""), "missing legacy 4173 import button");
assert(!app.includes("localStorage.removeItem(STORAGE_KEYS.uploadHistory)"), "migration must not delete legacy upload history");
assert(!app.includes("localStorage.removeItem(STORAGE_KEYS.generationHistory)"), "migration must not delete legacy generation history");
assert(app.includes("legacyKey && (!Array.isArray(value) || value.length > 0)"), "empty history writes must not overwrite legacy fallback storage");
assert(app.includes("const hasUploadSource ="), "initialization must detect upload source before writing IndexedDB");
assert(app.includes("const hasGenerationSource ="), "initialization must detect generation source before writing IndexedDB");
assert(app.includes("if (hasUploadSource || state.uploadHistory.length > 0)"), "initialization must avoid writing empty upload history without a source");
assert(app.includes("if (hasGenerationSource || state.generationHistory.length > 0)"), "initialization must avoid writing empty generation history without a source");
assert(app.includes("if (state.uploadHistory.length > 0) writes.push(writeHistoryDb(HISTORY_IDB_KEYS.uploadHistory, state.uploadHistory));"), "manual recovery must not write empty upload history");
assert(app.includes("if (state.generationHistory.length > 0) writes.push(writeHistoryDb(HISTORY_IDB_KEYS.generationHistory, state.generationHistory));"), "manual recovery must not write empty generation history");
assert(app.includes("restoreReport"), "recovery should report restored counts");
assert(bridge.includes("api-console-history-bridge"), "legacy bridge must post the expected message type");
assert(bridge.includes("api_console_history_db_v1"), "legacy bridge must read the history IndexedDB");

console.log("history-recovery checks passed");
