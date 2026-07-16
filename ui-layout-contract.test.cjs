const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");

function functionBody(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}" && --depth === 0) return appSource.slice(bodyStart + 1, index);
  }
  throw new Error(`${name} body is not closed`);
}

assert.match(appSource, /function renderRowStatusCell\(row\)/, "all task tables need a centralized status renderer");
const statusCell = functionBody("renderRowStatusCell");
assert.match(statusCell, /class="status-pill status-\$\{row\.status\}"/, "status renderer must keep the status pill");
assert.match(statusCell, /class="status-summary"/, "errors must have a compact status summary");
assert.match(statusCell, /class="tiny-button copy-row-error"/, "errors must provide a full-error copy action");
assert.match(statusCell, /data-row-error="\$\{escapeAttr\(row\.error\)\}"/, "copy action must retain the complete error");

[
  "renderRow",
  "renderImageVideoRow",
  "renderMotionRow",
  "renderAvatarRow",
  "renderMultiVideoRow",
  "renderViduRefRow",
  "refreshRowSubmittedStateDisplay"
].forEach(name => {
  const body = functionBody(name);
  assert.match(body, /renderRowStatusCell\(row\)/, `${name} must use the centralized status renderer`);
  assert.doesNotMatch(body, /escapeHtml\(row\.error\)/, `${name} must not render the full error inline`);
});

assert.match(appSource, /app\.addEventListener\("click", event => \{[\s\S]*?closest\("\.copy-row-error"\)[\s\S]*?copyPromptText\(copyButton\.dataset\.rowError \|\| ""\)/, "full error copying must use a non-accumulating app delegate");

["renderRow", "renderImageVideoRow", "renderMotionRow", "renderAvatarRow", "renderMultiVideoRow", "renderViduRefRow"].forEach(name => {
  const body = functionBody(name);
  assert.match(body, /submit-[\w-]+" type="button" \$\{disabled\}/, `${name} should disable submit while processing`);
  assert.match(body, /remove-[\w-]+" type="button" \$\{disabled\}/, `${name} should disable delete while processing`);
  assert.match(body, /cancel-[\w-]+" type="button">取消<\//, `${name} must keep cancel available`);
  assert.match(body, /duplicate-[\w-]+" type="button">复制行<\//, `${name} must keep row copy available`);
});

assert.match(appSource, /<div class="sidebar-head">[\s\S]*?class="brand"[\s\S]*?API Base[\s\S]*?renderRunningHubMotionConfig\(\)[\s\S]*?<\/div>[\s\S]*?<nav class="nav-group">[\s\S]*?<div class="side-actions">/, "sidebar must split fixed head, navigation, and actions");
assert.match(cssSource, /\.sidebar\s*\{[\s\S]*?overflow:\s*hidden/, "sidebar itself must not scroll");
assert.match(cssSource, /\.nav-group\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto/, "only the navigation group may scroll");
assert.match(cssSource, /\.row-actions\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/, "row actions must be a single vertical grid");
assert.match(cssSource, /\.status-summary\s*\{[\s\S]*?max-width:\s*10em[\s\S]*?white-space:\s*nowrap[\s\S]*?text-overflow:\s*ellipsis/, "status summaries must stay one line and truncated");
assert.match(cssSource, /\.app-shell\s*\{[\s\S]*?grid-template-columns:\s*clamp\(210px, 26vw, 300px\) minmax\(0, 1fr\)/, "desktop sidebar must remain responsive and capped at 300px");
assert.doesNotMatch(cssSource, /@media \(max-width: 980px\)\s*\{[\s\S]*?\.app-shell\s*\{\s*grid-template-columns:\s*1fr/, "narrow desktop must preserve the two-column shell");

console.log("ui layout contract checks passed");
