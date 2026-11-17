const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const playwrightPath = process.env.AWF_PLAYWRIGHT || process.env.PROMPT_LIBRARY_PLAYWRIGHT;
const ffmpeg = process.env.AVATAR_WORKFLOW_FFMPEG_TEST;

test('large history stays bounded while scrolling, previewing and closing media', {
  skip: !playwrightPath || !ffmpeg, timeout: 90000
}, async () => {
  const { chromium } = require(playwrightPath);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'history-browser-'));
  let browser;
  try {
    const clip = path.join(temporary, 'fixture.mp4');
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=teal:s=320x180:d=1',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clip], { windowsHide: true });
    const videoBytes = await fs.readFile(clip);
    browser = await chromium.launch({ headless: true, channel: process.env.AWF_BROWSER_CHANNEL || 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    let uploadCount = 0;
    let uploadedFilename = '';
    let rejectUploads = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'history.test') return route.abort();
      if (url.pathname === '/api/fileupload') {
        uploadCount++;
        if (rejectUploads) return route.fulfill({ status: 503, json: { message: 'fixture upload unavailable' } });
        const body = route.request().postDataBuffer().toString('latin1');
        uploadedFilename = body.match(/filename="([^"]+)"/)?.[1] || '';
        return route.fulfill({ json: { success: true, data: { url: 'http://history.test/media/captured.jpg' } } });
      }
      if (url.pathname.startsWith('/media/')) {
        if (url.pathname.endsWith('.mp4')) {
          const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
          const start = range ? Number(range[1]) : 0;
          const end = range && range[2] ? Math.min(Number(range[2]), videoBytes.length - 1) : videoBytes.length - 1;
          return route.fulfill({ status: range ? 206 : 200, body: videoBytes.subarray(start, end + 1),
            contentType: 'video/mp4', headers: { 'accept-ranges': 'bytes',
              ...(range ? { 'content-range': `bytes ${start}-${end}/${videoBytes.length}` } : {}) } });
        }
        return route.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#427862"/><circle cx="160" cy="90" r="48" fill="#ffd55b"/></svg>', contentType: 'image/svg+xml' });
      }
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[-\w.]+$/.test(name)) return route.fulfill({ status: 503, body: 'Isolated test: API disabled' });
      let body;
      try { body = await fs.readFile(path.join(__dirname, name)); }
      catch { return route.fulfill({ status: 404, body: '' }); }
      if (name === 'app.js') {
        body = body.toString().replace('bootstrapApp().catch(error => showFatalError(error));',
          'window.PERF = { state, render, openHistoryMediaViewer, closeHistoryVideoOverlay };');
      }
      return route.fulfill({ body, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(name)] || 'text/plain' });
    });
    await page.goto('http://history.test/');
    await page.waitForFunction(() => window.PERF);
    const timings = await page.evaluate(() => {
      const state = PERF.state;
      Object.assign(state, { activePage: 'history', historyTab: 'generations', historyType: 'video',
        historyModel: 'all', historySize: 'all', historyOrigin: 'all', historySearch: '' });
      state.generationHistory = Array.from({ length: 4000 }, (_, i) => ({
        id: `fixture${i}`, createdAt: 100000 - i, page: 'multiVideo', model: 'Fixture', version: 'test',
        prompt: 'Synthetic prompt line.\n'.repeat(210) + i,
        refs: [{ type: 'image', url: 'http://history.test/media/reference.png', name: 'reference.png' }],
        results: [0, 1].map(n => `http://history.test/media/${i}-${n}.${i < 2000 ? 'mp4' : 'png'}`)
      }));
      let signatures = 0;
      const original = generationInputSignature;
      generationInputSignature = function (...args) { signatures++; return original(...args); };
      const renderMs = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        PERF.render();
        renderMs.push(Math.round(performance.now() - start));
      }
      return { renderMs, signatures };
    });
    assert.equal(timings.signatures, 12000, 'one signature per record per render');
    assert.equal(await page.locator('video[data-preview-src]').count(), 50, 'history stays paged');
    await page.waitForFunction(() => [...document.querySelectorAll('video[data-preview-src]')].some(video => video.readyState >= 2));
    await page.locator('.history-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(() => !document.querySelector('video[data-preview-src]').hasAttribute('src'));
    const loadedAfterScroll = await page.locator('video[data-preview-src][src]').count();
    assert.ok(loadedAfterScroll < 20, 'scrolling must not retain all visited video sources');

    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(() => PERF.openHistoryMediaViewer('generation:fixture0::0', 'history', 'video'));
      await page.waitForFunction(() => document.querySelector('[data-history-viewer-video]').readyState >= 2);
      await page.locator('[data-history-viewer-next]').click();
      assert.equal(await page.locator('.history-video-overlay').getAttribute('data-current-token'), 'generation:fixture0::1');
      await page.locator('[data-history-viewer-next-group]').click();
      assert.equal(await page.locator('.history-video-overlay').getAttribute('data-current-token'), 'generation:fixture1::0');
      await page.locator('[data-history-viewer-close]').click();
      assert.equal(await page.locator('[data-history-viewer-video]').getAttribute('src'), null);
    }

    await page.evaluate(() => {
      PERF.state.historyType = 'image'; PERF.state.historyPage = 1; PERF.render();
      PERF.openHistoryMediaViewer('generation:fixture2000::0', 'history', 'image');
    });
    await page.waitForFunction(() => document.querySelector('[data-history-viewer-image]').naturalWidth === 320);
    await fs.mkdir(path.join(__dirname, '.codex-tmp'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '.codex-tmp/history-preview-desktop.png') });
    await page.locator('[data-history-viewer-close]').click();
    assert.equal(await page.locator('[data-history-viewer-image]').getAttribute('src'), null);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => PERF.render());
    await page.screenshot({ path: path.join(__dirname, '.codex-tmp/history-page-mobile.png') });
    await page.evaluate(() => PERF.openHistoryMediaViewer('generation:fixture2000::0', 'history', 'image'));
    await page.waitForFunction(() => document.querySelector('[data-history-viewer-image]').naturalWidth === 320);
    await page.screenshot({ path: path.join(__dirname, '.codex-tmp/history-preview-mobile.png') });
    await page.locator('[data-history-viewer-close]').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      PERF.state.historyType = 'video';
      PERF.state.generationHistory[0].results = Array.from({ length: 123 }, (_, i) => `http://history.test/media/bulk-${i}.mp4`);
      PERF.render();
    });
    await page.locator('[data-open-generation-group]').first().click();
    assert.equal(await page.locator('.generation-result-mini').count(), 50);
    await page.locator('[data-history-group-page="2"]').click();
    assert.equal(await page.locator('.generation-result-mini').count(), 50);
    assert.ok((await page.locator('.generation-result-mini .url-line').first().getAttribute('href')).endsWith('bulk-50.mp4'));
    await page.locator('[data-history-group-page="3"]').click();
    assert.equal(await page.locator('.generation-result-mini').count(), 23);
    assert.equal(await page.evaluate(() => PERF.state.generationHistory[0].results.length), 123);
    await page.evaluate(() => PERF.openHistoryMediaViewer('generation:fixture0::49', 'history', 'video'));
    await page.locator('[data-history-viewer-next]').click();
    assert.equal(await page.locator('.history-video-overlay').getAttribute('data-current-token'), 'generation:fixture0::50');
    await page.locator('[data-history-viewer-close]').click();
    const actionChecks = await page.evaluate(async () => {
      const checks = {};
      const overlay = ensureHistoryVideoOverlay();
      const originalRequest = overlay.requestFullscreen;
      const originalExit = document.exitFullscreen;
      const fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
      let fakeFullscreen = null;
      let finishRequest;
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fakeFullscreen });
      document.exitFullscreen = async () => { fakeFullscreen = null; };
      overlay.requestFullscreen = () => new Promise(resolve => {
        finishRequest = () => { fakeFullscreen = overlay; resolve(); };
      });
      try {
        openHistoryMediaViewer('generation:fixture0::0', 'history', 'video');
        closeHistoryVideoOverlay(overlay);
        finishRequest();
        await new Promise(resolve => setTimeout(resolve, 0));
        checks.closedRequestCannotLeaveFullscreen = fakeFullscreen === null;
        fakeFullscreen = null;
        let requested = false;
        overlay.requestFullscreen = () => { requested = true; return Promise.resolve(); };
        openHistoryMediaViewer('generation:missing::0', 'history', 'video');
        checks.invalidEntryDoesNotOpenFullscreen = !requested && !overlay.classList.contains('open');
        closeHistoryVideoOverlay(overlay);
        openHistoryMediaViewer('generation:fixture0::0', 'history', 'video');
        overlay.querySelector('[data-history-viewer-title]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        checks.dragOutDoesNotClosePreview = overlay.classList.contains('open');
        fakeFullscreen = overlay;
        document.dispatchEvent(new Event('fullscreenchange'));
        fakeFullscreen = null;
        document.dispatchEvent(new Event('fullscreenchange'));
        checks.nativeExitClosesCurrentPreview = !overlay.classList.contains('open');
        overlay.requestFullscreen = () => Promise.reject(new Error('fixture denied'));
        openHistoryMediaViewer('generation:fixture0::0', 'history', 'video');
        await new Promise(resolve => setTimeout(resolve, 0));
        checks.deniedFullscreenKeepsPreviewUsable = overlay.classList.contains('open');
        closeHistoryVideoOverlay(overlay);
      } finally {
        overlay.requestFullscreen = originalRequest;
        document.exitFullscreen = originalExit;
        if (fullscreenDescriptor) Object.defineProperty(document, 'fullscreenElement', fullscreenDescriptor);
        else delete document.fullscreenElement;
      }
      localStorage.setItem(STORAGE_KEYS.apiBase, 'http://history.test/api');
      openHistoryMediaViewer('generation:fixture0::0', 'history', 'video');
      return checks;
    });
    await page.waitForFunction(() => document.querySelector('[data-history-viewer-video]').readyState >= 2);
    const capture = await page.evaluate(async () => {
      const video = document.querySelector('[data-history-viewer-video]');
      const button = document.querySelector('[data-history-viewer-capture]');
      const errors = [];
      const originalAlert = window.alert;
      window.alert = message => errors.push(message);
      try {
        video.currentTime = 0.5;
        const seekingBefore = video.seeking;
        await captureHistoryVideoFrame(video, generationResultItems()[0], button);
        const stored = await readHistoryDb(HISTORY_IDB_KEYS.uploadHistory, []);
        return { seekingBefore, time: video.currentTime, errors, name: state.uploadHistory[0]?.name,
          width: state.uploadHistory[0]?.width, height: state.uploadHistory[0]?.height, stored: stored.length };
      } finally { window.alert = originalAlert; }
    });
    console.log(JSON.stringify({ actionChecks, capture, uploadCount, uploadedFilename }));
    assert.deepEqual(capture.errors, []);
    assert.ok(capture.seekingBefore, 'capture begins while a seek is pending');
    assert.equal(capture.time, 0.5, 'capture must not reload the video back to time zero');
    assert.ok(uploadedFilename.endsWith('_frame_0000500.jpg'));
    assert.equal(uploadCount, 1);
    assert.equal(capture.stored, 1);
    assert.equal(capture.width, 320);
    assert.equal(capture.height, 180);
    assert.ok(Object.values(actionChecks).every(Boolean), JSON.stringify(actionChecks));
    rejectUploads = true;
    const failedUpload = await page.evaluate(async () => {
      const video = document.querySelector('[data-history-viewer-video]');
      const button = document.querySelector('[data-history-viewer-capture]');
      const messages = [];
      const originalAlert = window.alert;
      window.alert = message => messages.push(message);
      try {
        video.currentTime = 0.6;
        await captureHistoryVideoFrame(video, generationResultItems()[0], button);
        return { disabled: button.disabled, count: state.uploadHistory.length, messages };
      } finally { window.alert = originalAlert; }
    });
    assert.equal(failedUpload.disabled, false, 'failed capture can be retried immediately');
    assert.equal(failedUpload.count, 1, 'failed upload must not append a fake history entry');
    assert.ok(failedUpload.messages[0].includes('fixture upload unavailable'));
    rejectUploads = false;
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fixture: '4000 records / 8000 results', ...timings, loadedAfterScroll }));
  } finally {
    if (browser) await browser.close();
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('history-browser-'));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
