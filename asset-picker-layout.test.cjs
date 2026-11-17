const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

// Node 20 exposes the same built-in WebSocket behind a flag.
if (typeof WebSocket === "undefined") {
  const result = spawnSync(process.execPath, ["--experimental-websocket", __filename], {
    stdio: "inherit", windowsHide: true, env: process.env
  });
  process.exit(result.status ?? 1);
}

const styles = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const markup = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const browser = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
].filter(Boolean).find(candidate => fs.existsSync(candidate));
assert.ok(browser, "Chrome is required; set CHROME_PATH to its executable");

const dialog = markup.match(/<dialog id="assetDialog"[\s\S]*?<\/dialog>/)?.[0];
assert.ok(dialog, "the production asset dialog must exist");
const rendererStart = app.indexOf("function renderAssetCard(");
assert.ok(rendererStart >= 0, "the production asset card renderer must exist");
const rendererEnd = app.indexOf("\nfunction ", rendererStart + 1);
assert.ok(rendererEnd > rendererStart, "the card renderer must have a function boundary");
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const renderCard = vm.runInNewContext(
  `${app.slice(rendererStart, rendererEnd)}\nrenderAssetCard`,
  {
    ASSET_HISTORY_UTILS: { favoriteKey: item => item.id },
    state: { uploadFavorites: new Set() },
    escapeHtml,
    escapeAttr: escapeHtml,
    shortUrl: value => value,
    assetMeta: () => "IMAGE | 4096 x 2048 | 12.8 MB"
  }
);
// No application boot, network media, browser storage, or user profile is involved.
const cards = Array.from({ length: 100 }, (_, index) => renderCard({
  id: `synthetic-${index}`,
  name: index % 7 === 0 ? `asset_${index}_${"long_filename_".repeat(6)}.png` : `asset_${index}.png`,
  type: "image",
  url: "",
  preview: ""
})).join("");

async function measureFixture() {
  const waitForLayout = () => new Promise(resolve => setTimeout(resolve, 80));
  const grid = document.getElementById("assetDialogGrid");
  const panel = document.querySelector("#assetDialog .modal-panel");
  const toolbar = document.querySelector(".asset-dialog-toolbar");
  const dialogElement = document.getElementById("assetDialog");
  let pager = document.getElementById("assetDialogPages");
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "assetDialogPages";
    pager.className = "pagination";
    toolbar.appendChild(pager);
  }
  pager.innerHTML = '<button type="button" class="tiny-button" disabled aria-label="Previous page">&#8592;</button>'
    + '<span class="meta-line">1 / 2 - 100 assets</span>'
    + '<label class="meta-line">Page <input type="number" min="1" max="2" value="1" style="width:72px"></label>'
    + '<button type="button" class="tiny-button" aria-label="Next page">&#8594;</button>';
  grid.innerHTML = window.fixtureCards;
  grid.querySelectorAll("img").forEach(img => img.removeAttribute("src"));
  dialogElement.showModal();
  await waitForLayout();
  const rect = element => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right,
      width: bounds.width, height: bounds.height };
  };
  const snapshots = [];
  const positions = [0, 0.25, 0.5, 0.75, 1, 0.5, 0];
  for (const state of ["unloaded", "loaded"]) {
    if (state === "loaded") {
      const sizes = [[128, 128], [960, 120], [120, 960]];
      const sources = sizes.map(([width, height], index) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = ["#148071", "#b93b53", "#306dcc"][index];
        context.fillRect(0, 0, width, height);
        context.fillStyle = "#ffffff";
        context.fillRect(width / 4, height / 4, width / 2, height / 2);
        return canvas.toDataURL("image/png");
      });
      await Promise.all(Array.from(grid.querySelectorAll("img"), async (img, index) => {
        img.loading = "eager";
        img.src = sources[index % sources.length];
        await img.decode();
      }));
      await waitForLayout();
    }
    for (const position of positions) {
      grid.scrollTop = (grid.scrollHeight - grid.clientHeight) * position;
      await waitForLayout();
      const bounds = Array.from(grid.querySelectorAll(".asset-card"), rect);
      let overlaps = 0;
      let minRowStep = Infinity;
      let minRowGap = Infinity;
      for (let index = 0; index < bounds.length; index += 1) {
        for (let next = index + 1; next < bounds.length; next += 1) {
          const a = bounds[index];
          const b = bounds[next];
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1) continue;
          if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps += 1;
          if (b.top > a.top) {
            minRowStep = Math.min(minRowStep, b.top - a.top);
            minRowGap = Math.min(minRowGap, b.top - a.bottom);
          }
        }
      }
      const previews = Array.from(grid.querySelectorAll("img"), rect);
      const gridBounds = rect(grid);
      const visible = bounds.map((card, index) => ({ card, index })).filter(({ card }) =>
        card.top >= gridBounds.top && card.bottom <= gridBounds.bottom);
      const hitFailures = visible.filter(({ card, index }) => {
        const hit = document.elementFromPoint((card.left + card.right) / 2, (card.top + card.bottom) / 2);
        return hit?.closest(".asset-card") !== grid.children[index];
      }).length;
      const contentOverflow = Array.from(grid.children).filter(card =>
        Array.from(card.children).some(child => {
          const a = rect(card);
          const b = rect(child);
          return b.left < a.left || b.right > a.right || b.top < a.top || b.bottom > a.bottom;
        })).length;
      snapshots.push({
        state, position, scrollTop: grid.scrollTop, scrollHeight: grid.scrollHeight,
        count: bounds.length, loaded: Array.from(grid.querySelectorAll("img")).filter(img => img.naturalWidth > 0).length,
        overlaps, minRowStep, minRowGap, hitFailures, contentOverflow,
        cardMinHeight: Math.min(...bounds.map(card => card.height)),
        cardMaxHeight: Math.max(...bounds.map(card => card.height)),
        previewMinHeight: Math.min(...previews.map(preview => preview.height)),
        previewMaxHeight: Math.max(...previews.map(preview => preview.height)),
        grid: gridBounds, toolbar: rect(toolbar), pager: rect(pager), panel: rect(panel), dialog: rect(dialogElement),
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: grid.scrollWidth - grid.clientWidth,
        documentOverflow: document.documentElement.scrollHeight - innerHeight,
        panelScrollTop: panel.scrollTop,
        rowSizing: getComputedStyle(grid).gridAutoRows,
        contentVisibility: getComputedStyle(grid.firstElementChild).contentVisibility,
        cardTops: bounds.map(card => card.top - gridBounds.top + grid.scrollTop),
        previewHeights: previews.map(preview => preview.height)
      });
    }
  }
  grid.scrollTop = (grid.scrollHeight - grid.clientHeight) * window.screenshotPosition;
  await waitForLayout();
  return snapshots;
}

async function connectChrome(child) {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Chrome debugger startup timed out")), 15000);
    let stderr = "";
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("exit", code => { clearTimeout(timeout); reject(new Error(`Chrome exited: ${code}`)); });
  });
  const socket = new WebSocket(endpoint);
  await once(socket, "open");
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error("isolated Chrome connection closed"));
    }
    pending.clear();
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return { send, socket };
}

async function renderAt(width, height) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "asset-picker-layout-"));
  let child;
  let connection;
  try {
    const fixturePath = path.join(tempDir, "fixture.html");
    fs.writeFileSync(fixturePath, `<!doctype html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${styles}\n${process.env.ASSET_LAYOUT_PROBE_CSS || ""}</style></head><body>${dialog}
      <script>window.fixtureCards = ${JSON.stringify(cards)};
      window.screenshotPosition = ${Number(process.env.ASSET_LAYOUT_SCREENSHOT_POSITION || 0)};
      window.measureFixture = ${measureFixture.toString()};
      </script></body></html>`, "utf8");
    child = spawn(browser, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--no-sandbox", "--remote-debugging-port=0",
      `--user-data-dir=${path.join(tempDir, "profile")}`, "about:blank"
    ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    connection = await connectChrome(child);
    const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => connection.send(method, params, sessionId);
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["http://*", "https://*"] });
    await send("Page.enable");
    await send("Page.navigate", { url: pathToFileURL(fixturePath).href });
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
      const probe = await send("Runtime.evaluate", { expression: "typeof window.measureFixture === 'function'" });
      ready = probe.result?.value === true;
      if (!ready) await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(ready, "synthetic fixture must finish navigation");
    const result = await send("Runtime.evaluate", {
      expression: "window.measureFixture()", awaitPromise: true, returnByValue: true
    });
    assert.ok(!result.exceptionDetails, `fixture failed: ${JSON.stringify(result.exceptionDetails)}`);
    const screenshotDir = process.env.ASSET_LAYOUT_SCREENSHOT_DIR;
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      const label = process.env.ASSET_LAYOUT_LABEL || "current";
      const screenshot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.resolve(screenshotDir, `${label}-${width}x${height}.png`), Buffer.from(screenshot.data, "base64"));
    }
    return result.result.value;
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      const shutdownTimeout = setTimeout(() => child.kill(), 5000);
      if (connection) await connection.send("Browser.close").catch(() => {});
      else child.kill();
      await exited;
      clearTimeout(shutdownTimeout);
    }
    if (connection) connection.socket.close();
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}
async function checkViewport(width, height) {
  const snapshots = await renderAt(width, height);
  for (const metrics of snapshots) {
    const label = `${width}x${height} ${metrics.state}@${metrics.position}`;
    const initial = snapshots[0];
    check(metrics.viewport.width === width && metrics.viewport.height === height, `${label}: exact viewport is required`);
    check(metrics.count === 100, `${label}: all 100 cards must be measured`);
    check(metrics.loaded === (metrics.state === "loaded" ? 100 : 0), `${label}: image state must match fixture`);
    check(metrics.overlaps === 0, `${label}: ${metrics.overlaps} overlapping card pairs`);
    check(metrics.minRowGap >= 11, `${label}: row gap ${metrics.minRowGap}px must preserve the 12px gutter`);
    check(metrics.cardMinHeight >= 120, `${label}: card collapsed to ${metrics.cardMinHeight}px`);
    check(metrics.previewMinHeight >= 64, `${label}: preview collapsed to ${metrics.previewMinHeight}px`);
    check(metrics.hitFailures === 0, `${label}: ${metrics.hitFailures} obscured card hit targets`);
    check(metrics.contentOverflow === 0, `${label}: card contents must remain inside card bounds`);
    check(metrics.horizontalOverflow <= 1, `${label}: ${metrics.horizontalOverflow}px horizontal overflow`);
    check(metrics.documentOverflow <= 1, `${label}: document must not scroll`);
    check(metrics.scrollHeight > metrics.grid.height, `${label}: card grid must scroll`);
    check(metrics.panelScrollTop === 0, `${label}: panel must not scroll`);
    check(Math.abs(metrics.toolbar.top - initial.toolbar.top) <= 1, `${label}: toolbar must stay fixed`);
    check(Math.abs(metrics.pager.top - initial.pager.top) <= 1, `${label}: pagination must stay fixed`);
    check(metrics.pager.bottom <= metrics.toolbar.bottom, `${label}: pagination must fit inside the toolbar`);
    check(metrics.grid.top >= metrics.toolbar.bottom, `${label}: toolbar must not cover cards`);
    check(metrics.dialog.top >= -1 && metrics.dialog.bottom <= metrics.viewport.height + 1,
      `${label}: dialog must remain within viewport`);
    check(metrics.grid.height >= 80, `${label}: grid must keep usable scrolling space`);
    check(metrics.cardTops.every((top, index) => Math.abs(top - initial.cardTops[index]) <= 1),
      `${label}: row positions must not shift after scrolling or image decoding`);
    check(metrics.previewHeights.every((value, index) => Math.abs(value - initial.previewHeights[index]) <= 1),
      `${label}: preview dimensions must not depend on image loading`);
  }
  for (const state of ["unloaded", "loaded"]) {
    const group = snapshots.filter(snapshot => snapshot.state === state);
    console.log(JSON.stringify({ requestedViewport: `${width}x${height}`, viewport: group[0].viewport,
      state, samples: group.length, overlaps: Math.max(...group.map(item => item.overlaps)),
      minRowStep: Math.min(...group.map(item => item.minRowStep)),
      minRowGap: Math.min(...group.map(item => item.minRowGap)),
      cardHeight: [Math.min(...group.map(item => item.cardMinHeight)), Math.max(...group.map(item => item.cardMaxHeight))],
      previewHeight: [Math.min(...group.map(item => item.previewMinHeight)), Math.max(...group.map(item => item.previewMaxHeight))],
      scrollHeight: [Math.min(...group.map(item => item.scrollHeight)), Math.max(...group.map(item => item.scrollHeight))],
      rowSizing: group[0].rowSizing, contentVisibility: group[0].contentVisibility }));
  }
}

async function main() {
  for (const [width, height] of [[1440, 1000], [768, 1024], [375, 667], [320, 640], [667, 375]]) {
    await checkViewport(width, height);
  }
  assert.equal(failures.length, 0, `asset picker layout regressions (${failures.length}):\n${failures.slice(0, 30).join("\n")}`);
  console.log("asset picker rendered layout checks passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
