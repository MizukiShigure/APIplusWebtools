const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const contracts = require("./model-contracts.js");
const agentAdapter = require("./agent-task-adapter.js");
const historyOriginUtils = require("./history-origin-utils.js");

const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const image = (id = "image") => ({ id, type: "image", url: `https://cdn.example/${id}.png` });

test("GPT26 GIF survives row copying, refresh, history recovery and recreation", async () => {
  const {ctx}=createHarness();
  const seed={model:"gpt26",version:"gpt-image-2.6-sunburst",prompt:"A bouncing ball",outputFormat:"gif",frameSize:"512x288",frameCount:12,frameDurationMs:150,renderQuality:"max"};
  const row=ctx.createRow(seed);
  const restored=ctx.normalizeRows(JSON.parse(JSON.stringify([row])))[0];
  const {record,replay}=await recover(createHarness(),"image",seed);
  for(const candidate of [row,restored,ctx.createRow({...row,id:"copy"}),replay]) {
    assert.equal(candidate.outputFormat,"gif");assert.equal(candidate.frameSize,"512x288");
    assert.equal(Number(candidate.frameCount),12);assert.equal(Number(candidate.frameDurationMs),150);
    assert.deepEqual(plain(contracts.buildGptImage26Payload(candidate)),contracts.buildGptImage26Payload(seed));
  }
  assert.notEqual(ctx.generationInputSignature(record),ctx.generationInputSignature({...plain(record),frameCount:13}));
});

test("GPT26 format controls show GIF fields, omit raster size for SVG and obey row locking", () => {
  const {ctx}=createHarness();const row=ctx.createRow({model:"gpt26",prompt:"Logo",outputFormat:"gif"});
  const html=ctx.renderImageParamsCell(row,["1K","2K","4K"],"disabled");
  assert.deepEqual(renderedSelect(html,"data-field","outputFormat").options.map(x=>x.value),["png","svg","gif"]);
  assert.ok(renderedSelect(html,"data-field","frameSize").disabled);
  assert.match(html,/data-field="frameCount"[^>]*disabled/);
  assert.doesNotMatch(html,/data-field="size"/);
  row.outputFormat="svg";
  assert.doesNotMatch(ctx.renderImageParamsCell(row,["1K","2K","4K"],""),/data-field="(?:size|frameSize|frameCount)"/);
  row.status="running";ctx.updateRowField(row,"outputFormat","png");assert.equal(row.outputFormat,"svg");
});

test("SVG switch preserves existing references and reports why it cannot switch", () => {
  const {ctx,state}=createHarness();const row=ctx.createRow({model:"gpt26",prompt:"Logo",images:[image()]});state.rows.push(row);
  ctx.updateRowField(row,"outputFormat","svg");
  assert.equal(row.outputFormat,"png");assert.equal(row.images.length,1);assert.match(row.error,/SVG/);
});

test("SVG rows refuse late asset-picker or drag/drop additions", () => {
  const {ctx,state}=createHarness();const row=ctx.createRow({model:"gpt26",prompt:"Logo",outputFormat:"svg"});state.rows.push(row);
  ctx.addUploadHistory=()=>{};
  ctx.addAssetsToRow(row,[image()]);assert.equal(row.images.length,0);assert.match(row.error,/SVG/);
});

test("GPT26 batch controls retain GIF settings through UI events and row creation", () => {
  const {ctx,state}=createHarness();state.rows.push(ctx.createRow({model:"gpt26",outputFormat:"gif",frameSize:"512x512",frameCount:10,frameDurationMs:120}));
  ctx.openBatchPromptDialog();ctx.bindBatchDefaultControls();
  assert.equal(ctx.batchOutputFormat.value,"gif");assert.equal(ctx.batchFrameSize.value,"512x512");
  ctx.batchFrameCount.value="14";ctx.batchFrameCount.dispatch("change");
  const row=ctx.createRow({...ctx.readBatchDefaultsFromControls(),prompt:"Ball"});
  assert.equal(contracts.buildGptImage26Payload(row).frame_count,14);
  assert.equal(contracts.buildGptImage26Payload(row).frame_duration_ms,120);
});

test("H3 image rows survive history and expose exactly eight reference slots", () => {
  const {ctx,state}=createHarness();const row=ctx.createRow({model:"minimaxH3Image",prompt:"Scene",size:"3:1",quality:"4K",images:[image()]});
  state.rows.push(row);ctx.enqueueRows([row]);assert.equal(row.status,"queued");
  ctx.appendRowResult(row,["https://cdn.example/result.png"],contracts.buildMiniMaxH3ImagePayload(row),"h3-task");
  const replay=ctx.createPendingRowFromGeneration(state.generationHistory[0],"image");
  assert.equal(replay.model,"minimaxH3Image");assert.deepEqual(contracts.buildMiniMaxH3ImagePayload(replay),contracts.buildMiniMaxH3ImagePayload(row));
});

function objectDeclaration(name) {
  const match = source.match(new RegExp(`^const ${name} = \\{[^]*?^};`, "m"));
  assert.ok(match, `Production ${name} declaration must exist`);
  return match[0];
}

// Only declarations are evaluated: never execute app startup, queues, or DOM setup.
// Including top-level helpers also covers helpers introduced by the app-side fixes.
const functionDeclarations = source.match(/^(?:async )?function [A-Za-z_$][\w$]*\([^]*?^}/gm);
assert.ok(functionDeclarations?.length, "Production function declarations must exist");
const production = new vm.Script([
  ...["STORAGE_KEYS", "IMAGE_MODELS", "IMAGE_VIDEO_MODELS", "MULTI_VIDEO_MODELS"].map(objectDeclaration),
  source.match(/^const VALID_ROW_STATUSES = .*;$/m)[0],
  ...functionDeclarations
].join("\n"), { filename: "app.js (declarations only)" });

function attribute(attributes, name) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? match[1] : undefined;
}

function optionsFromHtml(html) {
  return Array.from(html.matchAll(/<option\b([^>]*)>[\s\S]*?<\/option>/g), match => ({
    value: attribute(match[1], "value"),
    selected: /(?:^|\s)selected(?:\s|=|$)/.test(match[1])
  }));
}

function renderedSelect(html, selectorAttribute, field) {
  const match = Array.from(html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g))
    .find(item => attribute(item[1], selectorAttribute) === field);
  assert.ok(match, `Rendered ${selectorAttribute}=${field} control must exist`);
  return { options: optionsFromHtml(match[2]), disabled: /(?:^|\s)disabled(?:\s|=|$)/.test(match[1]) };
}

function createHarness() {
  const storage = new Map();
  const elements = new Map();
  const polls = [];
  function element(selector) {
    if (elements.has(selector)) return elements.get(selector);
    const listeners = new Map();
    const node = {
      value: "", hidden: false, disabled: false, style: {}, dataset: {}, _html: "",
      showModal() { this.open = true; },
      close() { this.open = false; },
      querySelector: element,
      querySelectorAll: () => [],
      closest: tag => element(`${selector} parent ${tag}`),
      setAttribute(name, value) { this[name] = value; },
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      dispatch(type) {
        for (const handler of listeners.get(type) || []) handler({ target: this });
      },
      get innerHTML() { return this._html; },
      set innerHTML(value) {
        this._html = String(value);
        const options = optionsFromHtml(this._html);
        if (options.length) this.value = (options.find(option => option.selected) || options[0]).value;
        for (const match of this._html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
          const id = attribute(match[1], "id");
          if (id) element(`#${id}`).innerHTML = match[2];
        }
      }
    };
    elements.set(selector, node);
    return node;
  }
  const state = {
    rows: [], imageVideoRows: [], multiRows: [], motionRows: [], avatarRows: [], viduRefRows: [],
    queue: [], resumeQueue: [], resumeRunning: 0, generationHistory: [],
    batchDefaults: null, batchImages: [], agentBrowserId: "test-browser", agentBrowserLabel: "Test browser"
  };
  const ctx = vm.createContext({
    ...contracts,
    MODEL_CONTRACTS: contracts,
    AGENT_TASK_ADAPTER: agentAdapter,
    HISTORY_ORIGIN_UTILS: historyOriginUtils,
    state,
    console,
    document: { querySelector: element, getElementById: id => element(`#${id}`) },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    }
  });
  for (const match of source.matchAll(/^const (\w+) = document\.querySelector\("([^"]+)"\);/gm)) {
    ctx[match[1]] = element(match[2]);
  }
  // Missing batch behavior should fail assertions, not DOM-stub lookup.
  ctx.batchRenderQuality ??= element("#batchRenderQuality");
  ctx.batchBackground ??= element("#batchBackground");
  production.runInContext(ctx);
  Object.assign(ctx, {
    render() {},
    renderBatchImages() {},
    recordUsedPrompt() {},
    notifyAgentRow() {},
    scheduleControlHistoryAppend() {},
    persistGenerationHistory() { storage.set("history", JSON.stringify(state.generationHistory)); },
    runQueue() {},
    runRecoveredTaskQueue() {},
    postJson() { throw new Error("Regression tests must not submit provider requests"); },
    async pollTask(endpoint, task) {
      polls.push({ endpoint, taskId: task.taskId });
      return ["https://cdn.example/recovered-result.mp4"];
    }
  });
  return { ctx, state, storage, polls, element };
}

async function recover(harness, page, seed) {
  const { ctx, state, polls, storage } = harness;
  const definitions = {
    image: ["createRow", "rows"],
    imageVideo: ["createImageVideoRow", "imageVideoRows"],
    multiVideo: ["createMultiRow", "multiRows"]
  };
  const [create, rows] = definitions[page];
  const row = ctx[create](plain(seed));
  Object.assign(row, { status: "queued", queuedJobs: 1, totalJobs: 1, runToken: "recovered-run", startedAt: Date.now() });
  state[rows].push(row);
  await ctx.processRecoveredRemoteTask({
    page, rowId: row.id, runToken: row.runToken,
    task: { taskId: `remote-${page}` }
  });
  assert.equal(row.error, "", "Recovery must not fail inside the harness");
  assert.equal(row.status, "done");
  assert.equal(polls.length, 1, "Recovery must query the existing task exactly once");
  assert.equal(polls[0].endpoint, page === "image" ? "/gen_img_4o_query" : "/seedance2_query");
  assert.equal(polls[0].taskId, `remote-${page}`);
  assert.equal(state.resumeRunning, 0);
  const records = ctx.normalizeGenerations(JSON.parse(storage.get("history")));
  assert.equal(records.length, 1, "Recovered completion must persist one history record");
  return { record: records[0], replay: ctx.createPendingRowFromGeneration(records[0], page) };
}

test("recovered GPT history retains render quality and background through persistence and replay", async () => {
  const harness = createHarness();
  const seed = {
    model: "gpt25", version: "gpt-image-2.5-sunburst", prompt: "A studio portrait.",
    size: "3:2", quality: "4K", renderQuality: "max", background: "transparent", images: [image()]
  };
  const { record, replay } = await recover(harness, "image", seed);
  assert.equal(record.renderQuality, "max", "Recovery has no original request payload to fall back to");
  assert.equal(record.background, "transparent");
  assert.equal(replay.renderQuality, "max");
  assert.equal(replay.background, "transparent");
  assert.deepEqual(contracts.buildGptImage25Payload(replay), contracts.buildGptImage25Payload(seed));
  assert.notEqual(harness.ctx.generationInputSignature(record), harness.ctx.generationInputSignature({
    ...plain(record), renderQuality: "medium", background: "auto"
  }), "Recovered history must not group with the default rendering settings");
});

test("history preview labels automatic duration instead of a negative number of seconds", () => {
  const { ctx } = createHarness();
  for (const duration of [-1, "-1"]) {
    const html = ctx.renderHistoryMediaViewerDetails({ record: { duration, sourceType: "multiVideo", model: "Seedance 2.5" } });
    assert.match(html, /\u81ea\u52a8\uff08-1\uff09/);
    assert.doesNotMatch(html, /-1s/);
  }
  assert.match(ctx.renderHistoryMediaViewerDetails({ record: { duration: "10" } }), /10s/);
});

for (const page of ["imageVideo", "multiVideo"]) {
  test(`recovered Seedance ${page} history retains MOV and disabled audio`, async () => {
    const harness = createHarness();
    const seed = {
      model: "seedance25", prompt: "Camera moves closer.", size: "9:16", quality: "1080p",
      duration: "30", outputFormat: "mov", generateAudio: false,
      ...(page === "imageVideo" ? { firstFrame: image("first"), lastFrame: image("last") } : { refs: [] })
    };
    const { record, replay } = await recover(harness, page, seed);
    assert.equal(record.outputFormat, "mov", "Recovered history must store the row output format explicitly");
    assert.equal(replay.outputFormat, "mov");
    assert.equal(replay.generateAudio, false);
    const build = page === "imageVideo" ? contracts.buildSeedance25FirstLastPayload : contracts.buildSeedance25MultiPayload;
    assert.deepEqual(build(replay), build(seed));
    assert.notEqual(harness.ctx.generationInputSignature(record), harness.ctx.generationInputSignature({
      ...plain(record), outputFormat: "mp4"
    }), "Recovered MOV history must remain distinct from MP4 history");
  });
}

test("Seedance history dedupes references without changing mixed @n meaning", () => {
  const { ctx, state, storage } = createHarness();
  const refs = [
    { id: "audio", type: "audio", url: "https://cdn.example/audio.mp3", duration: 20 },
    image("second"),
    { id: "video", type: "video", url: "https://cdn.example/video.mp4", duration: 8 },
    image("fourth")
  ];
  const row = ctx.createMultiRow({ model: "seedance25", prompt: "Use @1 with @2, then @3 and @4.", refs });
  const before = contracts.buildSeedance25MultiPayload(row);
  ctx.appendMultiRowResult(row, ["https://cdn.example/result.mp4"], before, "mixed-refs");
  assert.equal(state.generationHistory.length, 1);
  const record = ctx.normalizeGenerations(JSON.parse(storage.get("history")))[0];
  const replay = ctx.createPendingRowFromGeneration(record, "multiVideo");
  assert.deepEqual(plain(replay.refs.map(asset => asset.url)), refs.map(asset => asset.url));
  assert.equal(contracts.validateSeedance25MultiRow(replay), "", "A single 20-second audio must not become 40 seconds on replay");
  assert.deepEqual(contracts.buildSeedance25MultiPayload(replay), before);
});

test("legacy duplicated reference fields dedupe by URL with refs order taking precedence", () => {
  const { ctx } = createHarness();
  const refs = [
    { type: "audio", url: "https://cdn.example/first.mp3", duration: 4 },
    image("second"),
    { type: "video", url: "https://cdn.example/third.mp4", duration: 6 }
  ];
  const record = { refs: plain(refs), images: [refs[2], refs[0], refs[1]].map(asset => ({ ...asset, id: `duplicate-${asset.type}` })) };
  const snapshot = plain(record);
  const restored = ctx.generationAssetsFromRecord(record);
  assert.deepEqual(plain(restored.map(asset => asset.url)), refs.map(asset => asset.url));
  const labels = contracts.buildSeedance25ReferenceLabels(restored);
  assert.equal(contracts.normalizeSeedance25Prompt("@1 @2 @3", labels), "\u97f3\u98911 \u56fe\u72471 \u89c6\u98911");
  assert.deepEqual(record, snapshot, "Deduplication must not mutate the stored history");
});

test("primary refs keep repeated URLs and @n positions while supplemental mirrors are skipped", () => {
  const { ctx } = createHarness();
  const audio = { type: "audio", url: "https://cdn.example/repeated.mp3", duration: 4 };
  const second = image("second");
  const fourth = image("fourth");
  const refs = [{ ...audio, id: "first" }, second, { ...audio, id: "third" }];
  const record = {
    refs, images: [second, audio, fourth],
    firstFrame: { ...second }, lastFrame: { ...fourth }
  };
  const before = plain(record);
  const restored = ctx.generationAssetsFromRecord(record);
  assert.deepEqual(plain(restored.map(asset => asset.url)), [audio.url, second.url, audio.url, fourth.url]);
  assert.deepEqual(plain(restored.slice(0, 3).map(asset => asset.id)), ["first", "second", "third"]);
  const labels = contracts.buildSeedance25ReferenceLabels(restored);
  assert.equal(contracts.normalizeSeedance25Prompt("@1 @2 @3 @4", labels), "\u97f3\u98911 \u56fe\u72471 \u97f3\u98912 \u56fe\u72472");
  assert.deepEqual(record, before);
});

test("GPT batch normalization retains rendering enums separately from resolution", () => {
  const { ctx } = createHarness();
  for (const quality of contracts.GPT_IMAGE_25.qualities) {
    for (const renderQuality of contracts.GPT_IMAGE_25.renderQualities) {
      for (const background of contracts.GPT_IMAGE_25.backgrounds) {
        const input = {
          model: "gpt25", version: "gpt-image-2.5-sunburst", size: "16:9", quality,
          renderQuality, background, count: 2
        };
        const defaults = ctx.normalizeBatchDefaults(input);
        assert.equal(defaults.renderQuality, renderQuality);
        assert.equal(defaults.background, background);
        assert.equal(defaults.quality, quality);
        const row = ctx.createRow({ ...defaults, prompt: "Batch prompt." });
        const payload = contracts.buildGptImage25Payload(row);
        assert.equal(payload.image_quality, renderQuality);
        assert.equal(payload.image_background, background);
        assert.equal(payload.image_size, contracts.normalizeGptImage25Size("16:9", quality));
      }
    }
  }
});

test("opening the batch dialog inherits the first available GPT row's rendering settings", () => {
  const { ctx, state } = createHarness();
  state.rows.push(ctx.createRow({ model: "gpt25", prompt: "Portrait.", renderQuality: "max", background: "transparent" }));
  ctx.openBatchPromptDialog();
  assert.equal(state.batchDefaults.renderQuality, "max");
  assert.equal(state.batchDefaults.background, "transparent");
  assert.equal(ctx.pasteDialog.open, true);
  assert.equal(ctx.batchRenderQuality.value, "max");
  assert.equal(ctx.batchBackground.value, "transparent");
  assert.equal(ctx.batchRenderQuality.closest("label").hidden, false);
  assert.equal(ctx.batchBackground.closest("label").hidden, false);
  assert.deepEqual(optionsFromHtml(ctx.batchRenderQuality.innerHTML).map(option => option.value), contracts.GPT_IMAGE_25.renderQualities);
  assert.deepEqual(optionsFromHtml(ctx.batchBackground.innerHTML).map(option => option.value), contracts.GPT_IMAGE_25.backgrounds);
});

test("batch control reads propagate GPT rendering settings into generated rows", () => {
  const { ctx } = createHarness();
  const fields = {
    batchModel: "gpt25", batchVersion: "gpt-image-2.5-sunburst", batchSize: "4:3",
    batchQuality: "2K", batchCount: "3", batchRenderQuality: "xhigh", batchBackground: "opaque"
  };
  for (const [name, value] of Object.entries(fields)) ctx[name].value = value;
  const defaults = ctx.readBatchDefaultsFromControls();
  assert.equal(defaults.renderQuality, "xhigh");
  assert.equal(defaults.background, "opaque");
  const row = ctx.createRow({ ...ctx.normalizeBatchDefaults(defaults), prompt: "Batch prompt." });
  assert.equal(row.count, 3);
  assert.equal(contracts.buildGptImage25Payload(row).image_quality, "xhigh");
  assert.equal(contracts.buildGptImage25Payload(row).image_background, "opaque");
});

test("batch rendering controls update defaults on change without resetting the other setting", () => {
  const { ctx, state } = createHarness();
  state.rows.push(ctx.createRow({ model: "gpt25", renderQuality: "max", background: "transparent" }));
  ctx.openBatchPromptDialog();
  ctx.bindBatchDefaultControls();
  ctx.batchRenderQuality.value = "xhigh";
  ctx.batchRenderQuality.dispatch("change");
  assert.equal(state.batchDefaults.renderQuality, "xhigh");
  assert.equal(state.batchDefaults.background, "transparent");
  ctx.batchBackground.value = "opaque";
  ctx.batchBackground.dispatch("change");
  assert.equal(state.batchDefaults.renderQuality, "xhigh");
  assert.equal(state.batchDefaults.background, "opaque");
  ctx.batchVersion.value = "gpt-image-2.5-sunburst";
  ctx.batchVersion.dispatch("change");
  assert.equal(state.batchDefaults.renderQuality, "xhigh");
  assert.equal(state.batchDefaults.background, "opaque");
});

test("renderOptions omits the blank only when explicitly requested", () => {
  const { ctx } = createHarness();
  assert.deepEqual(optionsFromHtml(ctx.renderOptions(["mp4", "mov"], "mov", null)).map(option => option.value), ["mp4", "mov"]);
  assert.deepEqual(optionsFromHtml(ctx.renderOptions(["mp4", "mov"], "mov", "Default")).map(option => option.value), ["", "mp4", "mov"]);
});

for (const field of ["renderQuality", "background"]) {
  test(`GPT ${field} control contains exactly the contract enums and no blank choice`, () => {
    const { ctx } = createHarness();
    const row = ctx.createRow({ model: "gpt25", renderQuality: "max", background: "transparent" });
    const expected = field === "renderQuality" ? contracts.GPT_IMAGE_25.renderQualities : contracts.GPT_IMAGE_25.backgrounds;
    for (const disabled of ["", "disabled"]) {
      const html = ctx.renderImageParamsCell(row, contracts.GPT_IMAGE_25.qualities, disabled);
      const control = renderedSelect(html, "data-field", field);
      assert.deepEqual(control.options.map(option => option.value), expected, "Blank or unsupported choices must not be rendered");
      assert.deepEqual(control.options.filter(option => option.selected).map(option => option.value), [row[field]]);
      assert.equal(control.disabled, Boolean(disabled));
    }
  });
}

for (const page of ["imageVideo", "multiVideo"]) {
  test(`Seedance ${page} output-format control has only MP4/MOV choices`, () => {
    const { ctx } = createHarness();
    const row = page === "imageVideo"
      ? ctx.createImageVideoRow({ model: "seedance25", outputFormat: "mov" })
      : ctx.createMultiRow({ model: "seedance25", outputFormat: "mov" });
    for (const disabled of ["", "disabled"]) {
      const html = page === "imageVideo"
        ? ctx.renderImageVideoParamsCell(row, disabled)
        : ctx.renderMultiParamsCell(row, ctx.getMultiModel(row), disabled);
      const control = renderedSelect(html, page === "imageVideo" ? "data-image-video-field" : "data-multi-field", "outputFormat");
      assert.deepEqual(control.options.map(option => option.value), ["mp4", "mov"]);
      assert.deepEqual(control.options.filter(option => option.selected).map(option => option.value), ["mov"]);
      assert.equal(control.disabled, Boolean(disabled));
    }
  });
}

for (const sourceType of ["UI", "Agent"]) {
  test(`image-only GPT25 input queues successfully through ${sourceType} row creation`, () => {
    const { ctx, state } = createHarness();
    const seed = sourceType === "UI"
      ? { model: "gpt25", images: [image()] }
      : agentAdapter.createRowSeed({
        taskId: "agent-image-only", taskType: "image",
        input: { model: "gpt25", assets: { images: [image()] }, options: { renderQuality: "max", background: "transparent" } }
      }).row;
    const row = ctx.createRow(seed);
    state.rows.push(row);
    assert.equal(contracts.validateGptImage25Row(row), "");
    ctx.enqueueRows([row]);
    assert.equal(row.status, "queued", row.error);
    assert.equal(row.error, "");
    assert.equal(state.queue.length, 1);
    assert.equal(state.queue[0].rowId, row.id);
    assert.equal(contracts.buildGptImage25Payload(row).prompt, "");
  });
}

test("prompt-optional GPT25 still rejects empty inputs and malformed image references", () => {
  for (const images of [[], [{ type: "image", url: " " }], [image(), image("2"), image("3"), image("4"), image("5")]]) {
    const { ctx, state } = createHarness();
    const row = ctx.createRow({ model: "gpt25", images });
    state.rows.push(row);
    ctx.enqueueRows([row]);
    assert.equal(row.status, "failed");
    assert.ok(row.error);
    assert.equal(state.queue.length, 0);
  }
});

test("legacy image models still require a prompt at enqueue time", () => {
  const { ctx, state } = createHarness();
  const row = ctx.createRow({ model: "nano", images: [image()] });
  state.rows.push(row);
  ctx.enqueueRows([row]);
  assert.equal(row.status, "failed");
  assert.ok(row.error);
  assert.equal(state.queue.length, 0);
});

for (const page of ["imageVideo", "multiVideo"]) {
  const isImageVideo = page === "imageVideo";
  const create = isImageVideo ? "createImageVideoRow" : "createMultiRow";
  const normalize = isImageVideo ? "normalizeImageVideoRows" : "normalizeMultiRows";
  const update = isImageVideo ? "updateImageVideoRowField" : "updateMultiRowField";
  const rowsKey = isImageVideo ? "imageVideoRows" : "multiRows";
  const storageKey = isImageVideo ? "api_console_image_video_rows_v1" : "api_console_multi_video_rows_v1";
  const build = isImageVideo ? contracts.buildSeedance25FirstLastPayload : contracts.buildSeedance25MultiPayload;

  test(`Seedance ${page} duration offers a labeled automatic choice without a resetting blank`, () => {
    const { ctx } = createHarness();
    const row = ctx[create]({ model: "seedance25", duration: "-1" });
    for (const disabled of ["", "disabled"]) {
      const html = isImageVideo ? ctx.renderImageVideoParamsCell(row, disabled) : ctx.renderMultiParamsCell(row, ctx.getMultiModel(row), disabled);
      const control = renderedSelect(html, isImageVideo ? "data-image-video-field" : "data-multi-field", "duration");
      assert.deepEqual(control.options.map(option => option.value), ["-1", ...Array.from({ length: 27 }, (_, i) => String(i + 4))]);
      assert.deepEqual(control.options.filter(option => option.selected).map(option => option.value), ["-1"]);
      assert.match(html, /<option value="-1"[^>]*>\u81ea\u52a8\uff08-1\uff09<\/option>/);
      assert.equal(control.disabled, Boolean(disabled));
    }
    assert.equal(ctx[create]({ model: "seedance25" }).duration, "10");
  });

  test(`Seedance ${page} selection survives unrelated changes, persistence, reload and history replay`, () => {
    const { ctx, state, storage } = createHarness();
    const row = ctx[create]({ model: "seedance25", prompt: "Edit the reference video.", duration: "10", size: "16:9" });
    state[rowsKey].push(row);
    ctx[update](row, "duration", "-1");
    ctx[update](row, "size", "adaptive");
    ctx[update](row, "quality", "720p");
    assert.equal(row.duration, "-1");
    const [restored] = ctx[normalize](JSON.parse(storage.get(storageKey)));
    assert.equal(restored.duration, "-1");
    assert.equal(restored.size, "adaptive");
    assert.equal(build(restored).duration, -1);
    const replay = ctx.createPendingRowFromGeneration({ ...plain(restored), sourceType: page, type: "video" }, page);
    assert.equal(build(replay).duration, -1);
    Object.assign(row, { status: "running", runningJobs: 1 });
    ctx[update](row, "duration", "10");
    assert.equal(row.duration, "-1", "Running tasks stay locked");
  });

  test(`Seedance ${page} Agent rows preserve numeric automatic duration`, () => {
    const { ctx } = createHarness();
    const seed = agentAdapter.createRowSeed({ taskId: `auto-${page}`, taskType: page, input: {
      model: "seedance25", prompt: "Edit the scene.", options: { duration: -1 }
    } }).row;
    assert.equal(build(ctx[normalize]([ctx[create](seed)])[0]).duration, -1);
  });
}
