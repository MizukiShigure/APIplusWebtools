const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.AWF_PLAYWRIGHT || 'playwright'); } catch {}
let browser;
test.before(async () => {
  if (playwright) browser = await playwright.chromium.launch({headless:true,channel:process.env.AWF_BROWSER_CHANNEL || 'chrome'});
});
test.after(async () => { await browser?.close(); });
const browserTest = (name, run) => test(name, {skip:!playwright,timeout:20000}, run);

async function fixture(t) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.route('**/*', route => route.request().url() === 'http://awf-races.test/'
    ? route.fulfill({contentType:'text/html',body:'<!doctype html><main id="host"></main>'})
    : route.abort());
  await page.goto('http://awf-races.test/');
  await page.addScriptTag({path:path.join(__dirname,'avatar-workflow-production.js')});
  await page.evaluate(() => {
    const deferred = () => { const result = {}; result.promise = new Promise((resolve,reject) => Object.assign(result,{resolve,reject})); return result; };
    window.fx = {
      origin:{type:'browser',client:'web',id:'review-browser',label:'Test browser'},
      submissions:[],requests:[],loads:[],downloads:[],notices:[],dropSubmit:true,holdLibrary:false,libraryWait:null,
      library:{voices:[{id:'v1',name:'Voice'}],images:[{id:'i1',name:'First'},{id:'i2',name:'Second'},{id:'uploaded',name:'Uploaded'}],workflows:[]},
      mount(saved) {
        window.prod = AvatarWorkflowProduction.mount(document.querySelector('#host'), {
          saved,library:this.library,deps:{ffmpeg:{available:true},subtitle:{available:true}},
          origin:() => fx.origin,imageUrl:() => '',notice:(text,error) => fx.notices.push({text,error}),
          submit:async job => { fx.submissions.push(structuredClone(job)); if (fx.dropSubmit) throw new Error('Synthetic lost acknowledgment'); },
          request:(url,method,body) => { const request = {...deferred(),url,method,file:body.get('file') || body.get('image')}; fx.requests.push(request); return request.promise; },
          refreshLibrary:async () => {
            if (fx.holdLibrary) { fx.libraryWait = deferred(); await fx.libraryWait.promise; }
            prod.setLibrary(fx.library);
          },
          readText:url => { const load = {...deferred(),url}; fx.loads.push(load); return load.promise; }
        });
      }
    };
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { fx.downloads.push(blob.text()); return createObjectURL(blob); };
    // Exercise the generated download blob without writing a browser download to disk.
    HTMLAnchorElement.prototype.click = function () {};
    fx.mount({drafts:{speech:{text:'Original',voiceId:'v1'},avatar:{imageId:'i1',prompt:'Keep prompt'},subtitle:{text:'Keep transcript'}}});
    prod.setJobs([]);
    document.querySelector('.awf-audio-adjust').open = true;
  });
  return page;
}

async function uncertainSpeech(page) {
  await page.locator('[data-submit="speech"]').click();
  await page.waitForFunction(() => fx.submissions.length === 1 && !document.querySelector('[data-submit="speech"]').disabled);
}

for (const state of ['completed','failed']) browserTest(`uncertain ${state} job reconciles by original identity after remount without replacing drafts`, async t => {
  const page = await fixture(t);
  await uncertainSpeech(page);
  await page.locator('[data-operation="speech"] [name="text"]').fill('Next draft');
  await page.evaluate(state => {
    const saved = prod.snapshot(); prod.dispose();
    fx.origin = {...fx.origin,id:'new-current-browser'};
    fx.mount(saved);
    const original = fx.submissions[0];
    prod.setJobs([{...original,origin:{...original.origin,label:'Renamed label'},id:'recovered',state,steps:{}}]);
  }, state);
  assert.equal(await page.evaluate(() => prod.snapshot().pending.speech), undefined, 'authoritative matching task must clear pending');
  assert.equal(await page.locator('[data-operation="speech"] [name="text"]').inputValue(), 'Next draft');
  await page.evaluate(() => { fx.dropSubmit = false; });
  await page.locator('[data-submit="speech"]').click();
  await page.waitForFunction(() => fx.submissions.length === 2);
  assert.equal(await page.evaluate(() => fx.submissions[0].clientTaskId !== fx.submissions[1].clientTaskId), true);
});

browserTest('same task ID from another origin never clears pending, and unchanged retry keeps its ID', async t => {
  const page = await fixture(t);
  await uncertainSpeech(page);
  const pending = await page.evaluate(() => prod.snapshot().pending.speech);
  for (const override of [{id:'other'},{client:'other'},{type:'agent'},null]) {
    await page.evaluate(override => {
      const original = fx.submissions[0];
      prod.setJobs([{...original,origin:override ? {...original.origin,...override} : undefined,id:'foreign',state:'completed',steps:{}}]);
    }, override);
    assert.deepEqual(await page.evaluate(() => prod.snapshot().pending.speech), pending);
  }
  await page.locator('[data-submit="speech"]').click();
  await page.waitForFunction(() => fx.submissions.length === 2);
  assert.equal(await page.evaluate(() => fx.submissions[0].clientTaskId === fx.submissions[1].clientTaskId), true);
});

const uploadCases = [
  {op:'adjustAudio',kind:'audio',field:'audioUrl',name:'a.wav',mimeType:'audio/wav'},
  {op:'avatar',kind:'audio',field:'audioUrl',name:'a.wav',mimeType:'audio/wav'},
  {op:'avatar',kind:'image',field:'imageId',name:'i.png',mimeType:'image/png'},
  {op:'subtitle',kind:'media',field:'mediaUrl',name:'v.mp4',mimeType:'video/mp4'}
];
async function beginUpload(page, c) {
  const count = await page.evaluate(() => fx.requests.length);
  await page.locator(`[data-operation="${c.op}"] [data-upload="${c.kind}"]`).setInputFiles({name:c.name,mimeType:c.mimeType,buffer:Buffer.from('synthetic fixture')});
  await page.waitForFunction(count => fx.requests.length > count, count);
  return count;
}
async function finishUpload(page, c, index) {
  await page.evaluate(({index,kind}) => fx.requests[index].resolve(kind === 'image' ? {item:{id:'uploaded'}} : {url:'/api/control/v1/avatar-workflow/media/uploaded.bin'}), {index,kind:c.kind});
  await page.waitForFunction(({op,kind}) => !document.querySelector(`[data-operation="${op}"] [data-upload="${kind}"]`).disabled, c);
}
for (const c of uploadCases) browserTest(`late ${c.op}/${c.kind} upload preserves a newer choice; unchanged uploads still apply`, async t => {
  const page = await fixture(t);
  const index = await beginUpload(page,c);
  const target = page.locator(`[data-operation="${c.op}"] [name="${c.field}"]`);
  const newer = c.kind === 'image' ? 'i2' : 'https://media.invalid/newer.wav';
  if (c.kind === 'image') await target.selectOption(newer); else await target.fill(newer);
  await finishUpload(page,c,index);
  assert.equal(await target.inputValue(), newer, 'late upload must not overwrite a newer media choice');
  assert.equal(await page.locator('[name="prompt"]').inputValue(), 'Keep prompt');
  assert.equal(await page.locator('[data-operation="subtitle"] [name="text"]').inputValue(), 'Keep transcript');
  assert.equal(await page.evaluate(() => fx.submissions.length), 0);
  const next = await beginUpload(page,c);
  await finishUpload(page,c,next);
  assert.equal(await target.inputValue(), c.kind === 'image' ? 'uploaded' : '/api/control/v1/avatar-workflow/media/uploaded.bin');
  if (c.kind === 'media') assert.equal(await page.evaluate(() => AvatarWorkflowProduction.buildStageJob('subtitle',prod.snapshot().drafts.subtitle).input.mediaType), 'video');
});

browserTest('changing a URL away and back still invalidates the pending upload', async t => {
  const page = await fixture(t), c = uploadCases[1];
  const target = page.locator('[data-operation="avatar"] [name="audioUrl"]');
  await target.fill('https://media.invalid/original.wav');
  const index = await beginUpload(page,c);
  await target.fill('https://media.invalid/other.wav');
  await target.fill('https://media.invalid/original.wav');
  await finishUpload(page,c,index);
  assert.equal(await target.inputValue(), 'https://media.invalid/original.wav');
});

browserTest('a manual handoff during audio upload retains its URL and source identity', async t => {
  const page = await fixture(t), c = uploadCases[1];
  const index = await beginUpload(page,c);
  await page.evaluate(() => prod.setJobs([{id:'source',state:'completed',input:{operation:'speech',text:'Source text'},steps:{speech:{url:'https://media.invalid/handoff.wav'}}}]));
  await page.locator('[data-result-actions="speech"] [data-target="avatar"]').click();
  await finishUpload(page,c,index);
  const draft = await page.evaluate(() => prod.snapshot().drafts.avatar);
  assert.equal(draft.audioUrl,'https://media.invalid/handoff.wav');
  assert.equal(draft.sourceJobId,'source');
  assert.equal(draft.text,'Source text');
});

browserTest('image selection during the post-upload library refresh is preserved', async t => {
  const page = await fixture(t), c = uploadCases[2];
  await page.evaluate(() => { fx.holdLibrary = true; });
  const index = await beginUpload(page,c);
  await page.evaluate(index => fx.requests[index].resolve({item:{id:'uploaded'}}),index);
  await page.waitForFunction(() => Boolean(fx.libraryWait));
  await page.evaluate(() => { prod.useImage('i2'); fx.libraryWait.resolve(); });
  await page.waitForFunction(() => !document.querySelector('[data-upload="image"]').disabled);
  assert.equal(await page.locator('[name="imageId"]').inputValue(),'i2');
});

async function subtitleJobs(page) {
  await page.evaluate(() => prod.setJobs(['a','b'].map(id => ({id,state:'completed',input:{operation:'subtitle'},steps:{subtitle:{url:`/api/control/v1/avatar-workflow/media/${id}.srt`}}}))));
  await page.waitForFunction(() => fx.loads.length === 1);
}
browserTest('A/B/A subtitle loads are deduplicated and downloaded content keeps visible edits', async t => {
  const page = await fixture(t);
  await subtitleJobs(page);
  await page.locator('[name="output-subtitle"]').selectOption('b:subtitle');
  await page.locator('[name="output-subtitle"]').selectOption('a:subtitle');
  assert.equal(await page.evaluate(() => fx.loads.filter(load => load.url.endsWith('/a.srt')).length),1,'one in-flight fetch per result');
  await page.evaluate(() => fx.loads[0].resolve('A original'));
  await page.waitForFunction(() => !document.querySelector('[name="subtitleResult"]').disabled);
  await page.locator('[name="subtitleResult"]').fill('User edited A');
  await page.evaluate(() => fx.loads[1].resolve('B original'));
  await page.locator('[data-production-action="download-subtitle"]').click();
  await page.waitForFunction(() => fx.downloads.length === 1);
  assert.equal(await page.evaluate(() => fx.downloads[0]),'User edited A');
  await page.locator('[name="output-subtitle"]').selectOption('b:subtitle');
  await page.locator('[name="output-subtitle"]').selectOption('a:subtitle');
  assert.equal(await page.locator('[name="subtitleResult"]').inputValue(),'User edited A');
});

browserTest('an out-of-order stale SRT response cannot replace edited cache or download', async t => {
  const page = await fixture(t);
  await subtitleJobs(page);
  await page.locator('[name="output-subtitle"]').selectOption('b:subtitle');
  await page.locator('[name="output-subtitle"]').selectOption('a:subtitle');
  await page.evaluate(() => fx.loads.filter(load => load.url.endsWith('/a.srt')).at(-1).resolve('A original'));
  await page.waitForFunction(() => !document.querySelector('[name="subtitleResult"]').disabled);
  await page.locator('[name="subtitleResult"]').fill('User edited A');
  await page.evaluate(() => { fx.loads[0].resolve('A stale'); fx.loads[1].resolve('B original'); });
  await page.locator('[data-production-action="download-subtitle"]').click();
  await page.waitForFunction(() => fx.downloads.length === 1);
  assert.equal(await page.evaluate(() => fx.downloads[0]),await page.locator('[name="subtitleResult"]').inputValue());
});

browserTest('a rejected SRT load can retry and disposed loads cannot alter saved edits', async t => {
  const page = await fixture(t);
  await subtitleJobs(page);
  await page.evaluate(() => fx.loads[0].reject(new Error('Synthetic read failure')));
  await page.waitForFunction(() => fx.notices.some(notice => notice.error));
  await page.locator('[name="output-subtitle"]').selectOption('b:subtitle');
  await page.locator('[name="output-subtitle"]').selectOption('a:subtitle');
  await page.waitForFunction(() => fx.loads.length === 3);
  await page.evaluate(() => fx.loads[2].resolve('Retry succeeded'));
  await page.waitForFunction(() => !document.querySelector('[name="subtitleResult"]').disabled);
  await page.locator('[name="subtitleResult"]').fill('Saved edit');
  await page.evaluate(() => { window.saved = prod.snapshot(); prod.dispose(); fx.loads[1].resolve('Late B'); });
  assert.equal(await page.evaluate(() => saved.subtitleTexts['a:subtitle']),'Saved edit');
  assert.equal(await page.evaluate(() => saved.subtitleTexts['b:subtitle']),undefined);
});
