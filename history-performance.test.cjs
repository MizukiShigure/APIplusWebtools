const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(`${__dirname}/app.js`, 'utf8');

function frameHarness() {
  const listeners = new Map();
  const video = {
    readyState: 2, seeking: true, currentTime: 4.5, loads: 0,
    load() { this.loads++; },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); }
  };
  const context = vm.createContext({ setTimeout, clearTimeout, DOMException });
  vm.runInContext(declaration('waitForVideoFrame'), context);
  vm.runInContext(declaration('cancelHistoryFrameCapture'), context);
  return { video, listeners, context };
}

test('frame waiting preserves the playhead and waits until seeking finishes', async () => {
  const { video, listeners, context } = frameHarness();
  let settled = false;
  const waiting = context.waitForVideoFrame(video).then(() => { settled = true; });
  listeners.get('canplay')();
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(video.loads, 0);
  assert.equal(video.currentTime, 4.5);
  video.seeking = false;
  listeners.get('seeked')();
  await waiting;
  assert.equal(listeners.size, 0);
});

test('canceling stale frame capture rejects and removes every media listener', async () => {
  const { video, listeners, context } = frameHarness();
  const controller = new AbortController();
  video.frameCaptureController = controller;
  const waiting = context.waitForVideoFrame(video, controller.signal);
  context.cancelHistoryFrameCapture(video);
  await assert.rejects(waiting, { name: 'AbortError' });
  assert.equal(listeners.size, 0);
  assert.equal(video.frameCaptureController, undefined);
  assert.equal(video.loads, 0);
});

test('frame error and timeout both clean up media listeners', async () => {
  const { video, listeners, context } = frameHarness();
  video.error = { code: 4 };
  await assert.rejects(context.waitForVideoFrame(video));
  assert.equal(listeners.size, 0);
  video.error = null;
  await assert.rejects(context.waitForVideoFrame(video, null, 5));
  assert.equal(listeners.size, 0);
});

function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

function historyHarness() {
  let signatures = 0;
  const state = {
    historyType: 'video', historyOrigin: 'all', historyModel: 'all', historySize: 'all', historySearch: '',
    generationFavorites: new Set(),
    generationHistory: Array.from({ length: 100 }, (_, i) => ({
      id: String(i), prompt: `prompt${i}`, createdAt: i, results: [`${i}.mp4`, `${i}b.mp4`]
    }))
  };
  const context = vm.createContext({
    state, HISTORY_ORIGIN_UTILS: { matchesOrigin: () => true },
    guessType: () => 'video', generationResultKey: (id, index) => `${id}::${index}`,
    generationInputSignature: record => { signatures++; return record.prompt; }, hashText: text => text
  });
  vm.runInContext('let historyDerivationCache = null;', context);
  for (const name of ['withHistoryDerivations', 'memoHistoryDerivation', 'generationResultItems',
    'filteredGenerationResultItems', 'filteredGenerationInputGroups', 'generationInputGroupsFromItems']) {
    vm.runInContext(declaration(name), context);
  }
  const scoped = callback => context.withHistoryDerivations ? context.withHistoryDerivations(callback) : callback();
  return { state, context, scoped, signatures: () => signatures };
}

test('one history render calculates each record signature once, not once per result and control', () => {
  const { context, scoped, signatures } = historyHarness();
  scoped(() => {
    const items = context.generationResultItems();
    context.generationInputGroupsFromItems(items);
    for (let i = 0; i < 8; i++) assert.equal(context.filteredGenerationInputGroups().length, 100);
  });
  assert.equal(signatures(), 100);
});

test('history derivations expire after rendering, including failed renders and mutable records', () => {
  const { context, state, scoped } = historyHarness();
  let first;
  scoped(() => {
    first = context.generationResultItems();
    assert.equal(context.generationResultItems(), first);
    assert.equal(context.filteredGenerationInputGroups().length, 100);
    state.historySearch = 'prompt99';
    assert.equal(context.filteredGenerationInputGroups().length, 1, 'filter resets during render are respected');
  });
  state.historySearch = '';
  state.generationHistory[0].results.push('new.mp4');
  state.generationHistory[1].prompt = 'prompt0';
  scoped(() => {
    assert.notEqual(context.generationResultItems(), first);
    assert.equal(context.generationResultItems().length, 201);
    assert.equal(context.filteredGenerationInputGroups().length, 99);
  });
  assert.throws(() => scoped(() => { context.generationResultItems(); throw new Error('fixture'); }), /fixture/);
  state.generationHistory.splice(0, 1);
  assert.equal(context.generationResultItems().length, 198);
  state.historyFavoritesOnly = true;
  state.generationFavorites.add('1::0');
  scoped(() => assert.equal(context.filteredGenerationInputGroups().length, 1));
  state.generationFavorites.clear();
  scoped(() => assert.equal(context.filteredGenerationInputGroups().length, 0));
});

function mediaHarness() {
  let callback;
  const observed = new Set();
  const context = vm.createContext({
    IntersectionObserver: class {
      constructor(fn) { callback = fn; }
      observe(media) { observed.add(media); }
      unobserve(media) { observed.delete(media); }
    }
  });
  vm.runInContext('let previewObserver = null;', context);
  for (const name of ['activateVisibleMedia', 'unloadPreviewMedia', 'releasePreviewMedia', 'cancelHistoryFrameCapture']) {
    vm.runInContext(declaration(name), context);
  }
  const media = {
    dataset: { previewSrc: 'fixture.mp4' }, paused: true, controls: false, loads: 0, isConnected: true,
    getAttribute(name) { return this[name] || null; },
    removeAttribute(name) { delete this[name]; },
    pause() { this.paused = true; }, load() { this.loads++; }
  };
  const root = { querySelectorAll: () => [media] };
  return { context, root, media, observed, intersect: visible => callback([{ target: media, isIntersecting: visible }]) };
}

test('offscreen video posters release their source and reload only when visible again', () => {
  const { context, root, media, observed, intersect } = mediaHarness();
  context.activateVisibleMedia(root);
  intersect(true);
  assert.equal(media.src, 'fixture.mp4');
  intersect(false);
  assert.equal(media.getAttribute('src'), null);
  assert.equal(media.preload, 'none');
  assert.equal(media.loads, 1);
  assert.ok(observed.has(media), 'keep observing for reentry');
  intersect(true);
  assert.equal(media.src, 'fixture.mp4');
  context.releasePreviewMedia(root);
  assert.equal(observed.size, 0, 'removed DOM must not be retained by the observer');
  assert.equal(media.getAttribute('src'), null);
  media.isConnected = false;
  intersect(true);
  assert.equal(media.getAttribute('src'), null, 'stale observer deliveries must not reload detached video');
});

test('large expanded result groups render only the requested page without truncating history', () => {
  const state = { historyGroupResultPage: 2 };
  const context = vm.createContext({ state, HISTORY_PAGE_SIZE: 50,
    clampHistoryPage: (page, max) => Math.max(1, Math.min(max, Number(page) || 1)),
    renderGenerationGroupResultCard: item => `<fixture>${item.key}</fixture>` });
  vm.runInContext(declaration('renderGenerationGroupResults'), context);
  const group = { items: Array.from({ length: 123 }, (_, key) => ({ key })) };
  const html = context.renderGenerationGroupResults(group);
  assert.equal((html.match(/<fixture>/g) || []).length, 50);
  assert.ok(html.includes('<fixture>50</fixture>'));
  assert.ok(!html.includes('<fixture>100</fixture>'));
  assert.equal(group.items.length, 123);
  state.historyGroupResultPage = 99;
  assert.equal((context.renderGenerationGroupResults(group).match(/<fixture>/g) || []).length, 23);
  assert.equal(state.historyGroupResultPage, 3);
});

test('actively playing reference video is not interrupted just by scrolling', () => {
  const { context, root, media, intersect } = mediaHarness();
  context.activateVisibleMedia(root);
  intersect(true);
  media.controls = true;
  media.paused = false;
  intersect(false);
  assert.equal(media.src, 'fixture.mp4');
  assert.equal(media.paused, false);
});

test('closing the full viewer releases media and record-retaining event handlers', () => {
  const { context, media } = mediaHarness();
  media.src = 'full-video.mp4';
  const image = { src: 'large-image.png', removeAttribute(name) { delete this[name]; } };
  const action = { onclick() {} };
  let detailsCleared = false;
  const overlay = {
    classList: { remove() {} }, dataset: {},
    querySelector(selector) {
      if (selector.includes('video]')) return media;
      if (selector.includes('image]')) return image;
      if (selector.includes('details]')) return { replaceChildren() { detailsCleared = true; } };
      return null;
    },
    querySelectorAll: () => [action]
  };
  Object.assign(context, { document: { fullscreenElement: null }, app: {}, assetDialog: { open: false },
    activateVisibleMedia() {} });
  vm.runInContext(declaration('exitHistoryViewerFullscreen'), context);
  vm.runInContext(declaration('closeHistoryVideoOverlay'), context);
  context.closeHistoryVideoOverlay(overlay);
  assert.equal(media.getAttribute('src'), null);
  assert.equal(image.src, undefined);
  assert.equal(action.onclick, null);
  assert.equal(detailsCleared, true);
});
