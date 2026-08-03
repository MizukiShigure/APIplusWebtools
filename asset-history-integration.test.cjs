const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

assert.match(
  page,
  /asset-history-utils\.js[^>]*><\/script>[\s\S]*?<script src="\.\/app\.js/,
  "asset history utilities must load before app.js"
);
assert.match(app, /const ASSET_HISTORY_UTILS = globalThis\.AssetHistoryUtils;/);
assert.match(app, /uploadFavorites:\s*"api_console_upload_favorites_v1"/);
assert.match(app, /assetFavoritesOnly:\s*"api_console_asset_favorites_only_v1"/);
assert.match(app, /uploadFavorites:\s*new Set\(loadJson\(STORAGE_KEYS\.uploadFavorites, \[\]\)\)/);
assert.match(app, /assetFavoritesOnly:\s*localStorage\.getItem\(STORAGE_KEYS\.assetFavoritesOnly\) === "1"/);
assert.match(
  app,
  /function pruneUploadHistory\(records\)[\s\S]*?ASSET_HISTORY_UTILS\.dedupe\(normalizeAssets\(records\)\)/,
  "upload history pruning must remove exact duplicate records"
);
assert.match(
  app,
  /function addUploadHistory\(asset\)[\s\S]*?ASSET_HISTORY_UTILS\.findDuplicate\(state\.uploadHistory, normalized\)[\s\S]*?if \(duplicate\) return duplicate;/,
  "duplicate uploads must reuse the canonical history record"
);
assert.match(
  app,
  /scheduleControlHistoryAppend\(\[\{ \.\.\.normalized, kind: "upload" \}\]\);[\s\S]*?return normalized;/,
  "new upload history records must still be journaled and returned"
);

console.log("asset history integration checks passed");
