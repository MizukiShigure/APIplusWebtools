const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");

assert.match(page, /<div class="asset-dialog-toolbar">[\s\S]*?<h2>选择历史上传素材<\/h2>/);
assert.match(page, /id="assetFavoritesOnly"[\s\S]*?>仅看收藏<\/button>/);
assert.match(page, /id="assetDialogGrid" class="asset-grid asset-dialog-grid"/);

assert.match(styles, /#assetDialog \.modal-panel\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\);[\s\S]*?overflow:\s*hidden;/);
assert.match(styles, /\.asset-dialog-grid\s*\{[\s\S]*?overflow:\s*auto;/);
assert.match(styles, /\.asset-dialog-toolbar\s*\{[\s\S]*?background:\s*#fff;/);

assert.match(app, /ASSET_HISTORY_UTILS\.filterPicker\([\s\S]*?state\.assetFavoritesOnly/);
assert.match(app, /function toggleUploadFavorite\(item\)/);
assert.match(app, /saveJson\(STORAGE_KEYS\.uploadFavorites, Array\.from\(state\.uploadFavorites\)\)/);
assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.assetFavoritesOnly, state\.assetFavoritesOnly \? "1" : "0"\)/);
assert.match(app, /<article class="asset-card"[\s\S]*?data-asset-favorite=/);
assert.doesNotMatch(app, /<button class="asset-card"/);
assert.match(app, /favoriteButton\.addEventListener\("click", event => \{[\s\S]*?event\.stopPropagation\(\)/);
assert.match(app, /card\.addEventListener\("keydown", event => \{[\s\S]*?\["Enter", " "\]\.includes\(event\.key\)/);

console.log("asset picker UI contract checks passed");
