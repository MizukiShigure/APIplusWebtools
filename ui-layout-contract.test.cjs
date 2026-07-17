const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");

function findHeadlessBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || "";
}

function renderTaskLayoutAt(width, height) {
  const browser = findHeadlessBrowser();
  assert.ok(browser, "a Chromium-based browser is required for rendered layout checks");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "api-tools-layout-"));
  const htmlPath = path.join(tempDir, "layout.html");
  const stats = Array.from({ length: 5 }, (_, index) => `<div class="stat"><strong>${index}</strong><small>status</small></div>`).join("");
  const actions = Array.from({ length: 7 }, (_, index) => `<button class="button" type="button">action ${index}</button>`).join("");
  const nav = Array.from({ length: 12 }, (_, index) => `<button class="nav-button" type="button"><span>page ${index}</span><span>ready</span></button>`).join("");
  const rows = Array.from({ length: 12 }, (_, index) => `<tr><td>${index}</td><td><textarea class="prompt-input">prompt ${index}</textarea></td><td>result</td></tr>`).join("");
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>${cssSource}</style></head>
<body><div class="app-shell">
  <aside class="sidebar">
    <div class="sidebar-head"><div class="brand"><div class="brand-mark">AI</div><div><h1>Internal API Batch</h1><p>Local task workspace</p></div></div><label class="field"><span>API Base</span><input value="http://127.0.0.1"></label></div>
    <nav class="nav-group">${nav}</nav>
    <div class="side-actions"><button class="button">Export JSON</button><button class="button">Export CSV</button><button class="button">Clear</button></div>
  </aside>
  <main class="workspace">
    <section class="topbar"><div class="page-title"><h2>Multimodal video</h2><p>Long task-page description kept on the fixed top row.</p></div><div class="topbar-controls"><label class="field compact-field"><span>Concurrency</span><input value="3"></label><button class="file-button">Upload</button></div></section>
    <section class="batchbar"><div class="stats">${stats}</div><div class="topbar-controls">${actions}</div></section>
    <section class="table-wrap"><table class="task-table"><tbody>${rows}</tbody></table></section>
  </main>
</div><script>
  const table = document.querySelector('.table-wrap');
  const workspace = document.querySelector('.workspace');
  const sidebar = document.querySelector('.sidebar');
  const topbar = document.querySelector('.topbar');
  const batchbar = document.querySelector('.batchbar');
  const tableRect = table.getBoundingClientRect();
  const metrics = {
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    workspaceHeight: workspace.getBoundingClientRect().height,
    sidebarHeight: sidebar.getBoundingClientRect().height,
    topbarHeight: topbar.getBoundingClientRect().height,
    batchbarHeight: batchbar.getBoundingClientRect().height,
    tableTop: tableRect.top,
    tableBottom: tableRect.bottom,
    tableHeight: tableRect.height,
    tableOverflowY: getComputedStyle(table).overflowY,
    tableScrollable: table.scrollHeight > table.clientHeight
  };
  document.documentElement.setAttribute('data-layout', btoa(JSON.stringify(metrics)));
</script></body></html>`;

  try {
    fs.writeFileSync(htmlPath, html, "utf8");
    const result = spawnSync(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-sandbox",
      `--user-data-dir=${path.join(tempDir, "profile")}`,
      `--window-size=${width},${height}`,
      "--dump-dom",
      pathToFileURL(htmlPath).href
    ], { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.equal(result.status, 0, `headless layout render failed: ${result.stderr || result.stdout}`);
    const match = result.stdout.match(/data-layout="([^"]+)"/);
    assert.ok(match, "headless layout render must expose measured geometry");
    return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertUsableNarrowTaskLayout(width, height) {
  const metrics = renderTaskLayoutAt(width, height);
  assert.ok(metrics.tableHeight >= 180, `${width}x${height} task table must retain at least 180px, got ${metrics.tableHeight}px`);
  assert.ok(metrics.tableTop < metrics.viewportHeight - 180, `${width}x${height} task table must start inside the usable viewport`);
  assert.ok(metrics.tableBottom <= metrics.viewportHeight + 1, `${width}x${height} task table must stay inside the fixed workspace`);
  assert.ok(metrics.documentHeight <= metrics.viewportHeight + 1, `${width}x${height} shell must not create document scrolling`);
  assert.ok(Math.abs(metrics.workspaceHeight - metrics.viewportHeight) <= 1, `${width}x${height} workspace must remain viewport-height`);
  assert.ok(Math.abs(metrics.sidebarHeight - metrics.viewportHeight) <= 1, `${width}x${height} sidebar must remain viewport-height`);
  assert.ok(metrics.topbarHeight <= 112, `${width}x${height} fixed topbar must stay compact`);
  assert.ok(metrics.batchbarHeight <= 120, `${width}x${height} fixed batchbar must stay compact`);
  assert.equal(metrics.tableOverflowY, "auto", `${width}x${height} task table area must own its scrolling`);
  assert.equal(metrics.tableScrollable, true, `${width}x${height} task rows must scroll inside the table area`);
}

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
assertUsableNarrowTaskLayout(520, 720);
assertUsableNarrowTaskLayout(375, 667);

console.log("ui layout contract checks passed");
