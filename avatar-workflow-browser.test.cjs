const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createAgentService } = require('./agent-service.cjs');
const { createAvatarWorkflowService } = require('./avatar-workflow-service.cjs');
let chromium;
try { ({ chromium } = require(process.env.PROMPT_LIBRARY_PLAYWRIGHT || 'playwright')); } catch {}

test('native page: shared library, persisted jobs, stable drafts, responsive album', { skip: !chromium, timeout: 90000 }, async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'avatar-browser-'));
  const agent = await createAgentService({ root: dataDir, dataDir });
  const calls={speech:0,avatar:0,subtitle:0};
  const service = createAvatarWorkflowService({ root: dataDir, dataDir, agentService: agent, pollMs: 5,
    media: {
      dependencies: async () => ({ffmpeg:{available:true},subtitle:{available:true}}),
      speech: async () => {calls.speech++;return { url: 'https://example.invalid/mock.mp3', mimeType: 'audio/mpeg' };},
      upload: async () => ({url:'https://example.invalid/avatar.png'}),
      avatarCreate: async () => {calls.avatar++;return {url:'https://example.invalid/mock.mp4',mimeType:'video/mp4'};},
      subtitle: async () => {
        calls.subtitle++;
        const dir=path.join(dataDir,'avatar-workflow','media');
        await fs.mkdir(dir,{recursive:true});
        await fs.writeFile(path.join(dir,'example-subtitle.srt'),'1\n00:00:00,000 --> 00:00:01,000\nTest subtitle\n');
        return {url:'/api/control/v1/avatar-workflow/media/example-subtitle.srt',mimeType:'application/x-subrip'};
      }
    } });
  const voices = await service.store.put('voices', { id: 'voice-test', name: 'Test voice', voiceId: 'provider-voice',
    language: 'en', notes: 'Original source description', tags: ['bright'], sourceMetadata: { imported: true } }, { createOnly: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
  let firstImage;
  for (let i = 0; i < 15; i++) {
    const item = await service.store.saveImage({ buffer: Buffer.concat([png, Buffer.from(String(i))]), name: `Avatar ${i}.png`, mimeType: 'image/png' });
    if (!i) firstImage = item;
  }
  await service.store.put('images', { ...firstImage, voiceIds: [voices.id], defaultVoiceId: voices.id }, { expectedVersion: firstImage.version });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (await service.route(req, res, url.pathname, url)) return;
      if (await agent.route(req, res, url.pathname, url)) return;
      if (url.pathname === '/api/local/history') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ uploadHistory: agent.getHistory().filter(x => x.kind === 'upload'), generationHistory: agent.getHistory().filter(x => x.kind === 'generation') })); return;
      }
      if (url.pathname.startsWith('/api/')) { res.writeHead(404); res.end('{}'); return; }
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[\w.-]+$/.test(relative)) { res.writeHead(404); res.end(); return; }
      const content = await fs.readFile(path.join(__dirname, relative));
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(relative)] || 'text/plain');
      res.end(content);
    } catch { res.writeHead(500); res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.PROMPT_LIBRARY_BROWSER_CHANNEL || 'chrome', headless: true });
  t.after(async () => { await browser.close(); await service.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(dataDir, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const submitted=[];
  page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/avatar-workflow/jobs'))submitted.push(r.postDataJSON());});
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.route('https://**/*', route => route.abort());
  await page.goto(base + '/?page=avatarWorkflow', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '数字人工作流', exact: true }).waitFor();
  for (const id of ['subjectLibrary','avatar','viduVoice','viduRef','music','videoEdit']) {
    assert.equal(await page.locator(`.nav-button[data-page="${id}"]`).count(),0,`${id} removed from task navigation`);
  }
  for (const id of ['avatarWorkflow','image','imageVideo','motion','multiVideo','history']) {
    assert.equal(await page.locator(`.nav-button[data-page="${id}"]`).count(),1,`${id} retained in task navigation`);
  }
  await page.locator('[data-section="speech"]').waitFor();
  assert.equal(await page.locator('.awf-primary-tabs [role="tab"]').count(),3,'three large production tabs');
  assert.equal(await page.locator('.awf-library-tabs [role="tab"]').count(),4,'four separate compact library tabs');
  assert.equal(await page.locator('[data-section]:visible').count(),1,'only the selected production page is visible');
  assert.equal(await page.locator('[data-section="speech"]').isVisible(),true);
  const navGeometry=await page.evaluate(()=>{
    const main=document.querySelector('.awf-primary-tabs').getBoundingClientRect();
    const minorNode=document.querySelector('.awf-library-tabs');
    const minor=minorNode.getBoundingClientRect();
    return {insideHeader:Boolean(minorNode.closest('.awf-header')),above:minor.bottom<=main.top,larger:main.height>minor.height};
  });
  assert.deepEqual(navGeometry,{insideHeader:true,above:true,larger:true});
  await page.locator('[data-tab="voices"]').click();
  assert.equal(await page.locator('[data-voice-annotation="pending"]').count(),1,'old voices default to pending without a storage migration');
  assert.equal((await service.store.get('voices','voice-test')).version,1);
  await page.locator('[data-edit="voices"][data-id="voice-test"]').click();
  await page.locator('[data-editor="voices"] [name="preferredLanguages"]').fill('English，Portuguese, English');
  const requirements='Energetic ads <img src=x onerror=alert(1)>\nWarm narration';
  await page.locator('[data-editor="voices"] [name="selectionRequirements"]').fill(requirements);
  await page.locator('[data-editor="voices"] [type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-editor="voices"]'));
  const annotated=await service.store.get('voices','voice-test');
  assert.deepEqual(annotated.preferredLanguages,['English','Portuguese']);
  assert.equal(annotated.selectionRequirements,requirements);
  assert.equal(annotated.voiceId,'provider-voice');
  assert.equal(annotated.language,'en');
  assert.equal(annotated.notes,'Original source description');
  assert.deepEqual(annotated.tags,['bright']);
  assert.deepEqual(annotated.sourceMetadata,{imported:true});
  assert.deepEqual((await service.store.get('images',firstImage.id)).voiceIds,['voice-test']);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-tab="voices"]').click();
  await page.locator('[data-voice-annotation="annotated"]').waitFor();
  assert.ok((await page.locator('[data-panel="voices"]').innerText()).includes(requirements));
  assert.equal(await page.locator('[data-panel="voices"] img').count(),0,'preference text must be escaped');
  await fs.mkdir(path.join(__dirname,'.codex-tmp'),{recursive:true});
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.locator('.awf').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
    await page.locator('[data-panel="voices"]').screenshot({path:path.join(__dirname,'.codex-tmp/voice-annotations-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-edit="voices"][data-id="voice-test"]').click();
  assert.equal(await page.locator('[data-editor="voices"] [name="preferredLanguages"]').inputValue(),'English, Portuguese');
  await page.locator('[data-editor="voices"] [name="preferredLanguages"]').fill('');
  await page.locator('[data-editor="voices"] [name="selectionRequirements"]').fill('');
  await page.locator('[data-editor="voices"] [type="submit"]').click();
  await page.locator('[data-voice-annotation="pending"]').waitFor();
  assert.deepEqual((await service.store.get('voices','voice-test')).preferredLanguages,[]);
  await page.locator('[data-stage-tab="speech"]').click();
  await page.locator('[name=voiceId]').selectOption('voice-test');
  await page.locator('[data-operation=speech] [name=text]').fill('Persistent test draft.');
  await page.getByRole('button', { name: '生成语音', exact: true }).click();
  await page.waitForFunction(() => /completed|完成/.test(document.querySelector('[data-jobs]')?.textContent || ''));
  assert.equal(agent.getHistory().filter(x => x.kind === 'generation').length, 1);
  assert.equal(await page.locator('.awf-production-section').count(),3);
  assert.equal(submitted[0].input.operation,'speech');
  assert.deepEqual(calls,{speech:1,avatar:0,subtitle:0});
  await page.locator('[data-result-actions="speech"] [data-target="avatar"]').click();
  assert.equal(await page.locator('[data-stage-tab="avatar"]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-section="speech"]').isVisible(),false);
  assert.equal(submitted.length,1,'handoff must not submit');
  assert.equal(await page.locator('[data-operation="avatar"] [name="audioUrl"]').inputValue(),'https://example.invalid/mock.mp3');
  await page.locator('[name="imageId"]').selectOption(firstImage.id);
  await page.locator('[name="prompt"]').fill('Natural gestures');
  await page.locator('[data-submit="avatar"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-result-preview="avatar"] video'));
  assert.deepEqual(calls,{speech:1,avatar:1,subtitle:0});
  await page.locator('[data-result-actions="avatar"] [data-target="subtitle"]').click();
  assert.equal(await page.locator('[data-stage-tab="subtitle"]').getAttribute('aria-selected'),'true');
  assert.equal(submitted.length,2);
  assert.equal(await page.locator('[data-operation="subtitle"] [name="mediaUrl"]').inputValue(),'https://example.invalid/mock.mp4');
  assert.equal(await page.locator('[data-operation="speech"] [name="text"]').inputValue(),'Persistent test draft.');
  await page.locator('[data-operation="subtitle"] [name="text"]').fill('Subtitle original');
  await page.locator('[data-submit="subtitle"]').click();
  await page.waitForFunction(()=>document.querySelector('[name="subtitleResult"]')?.value.includes('Test subtitle'));
  assert.deepEqual(calls,{speech:1,avatar:1,subtitle:1});
  assert.equal(agent.getHistory().filter(x=>x.kind==='generation').length,3);
  await page.locator('[name="subtitleResult"]').fill('Edited subtitle');
  await page.locator('.awf-header [data-action="refresh"]').click();
  assert.equal(await page.locator('[name="subtitleResult"]').inputValue(),'Edited subtitle','polling must not overwrite subtitle edits');
  const download=page.waitForEvent('download');
  await page.locator('[data-production-action="download-subtitle"]').click();
  const file=await download;
  assert.equal(await fs.readFile(await file.path(),'utf8'),'Edited subtitle');
  await fs.mkdir(path.join(__dirname,'.codex-tmp'),{recursive:true});
  for(const section of ['speech','avatar','subtitle']) {
    await page.locator('[data-stage-tab="'+section+'"]').click();
    assert.equal(await page.locator('[data-section]:visible').count(),1);
    await page.screenshot({path:path.join(__dirname,'.codex-tmp/avatar-stages-'+section+'-desktop.png')});
    const columns=await page.locator('[data-section="'+section+'"] .awf-production-columns').first().evaluate(el=>[...el.children].map(c=>{const r=c.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top};}));
    assert.ok(columns[1].left>=columns[0].right);
  }
  await page.evaluate(() => render());
  await page.locator('[data-section="subtitle"]').waitFor();
  assert.equal(await page.locator('[data-stage-tab="subtitle"]').getAttribute('aria-selected'),'true','selected main tab survives remount');
  assert.equal(await page.locator('[name="subtitleResult"]').inputValue(),'Edited subtitle');
  await page.locator('[data-stage-tab="speech"]').click();
  assert.equal(await page.locator('[data-operation=speech] [name=text]').inputValue(), 'Persistent test draft.');
  await page.getByRole('tab', { name: '形象相册' }).click();
  await page.locator('.awf-image-card').first().waitFor();
  assert.equal(await page.locator('[data-section]:visible').count(),0,'library page does not leave production content visible');
  const geometry = await page.locator('.awf-image-card').evaluateAll(cards => cards.map(card => {
    const r = card.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom };
  }));
  assert.ok(geometry.length > 4);
  for (let i = 0; i < geometry.length; i++) {
    assert.ok(geometry[i].height >= 180);
    const earlier = geometry.slice(0, i).filter(r => Math.abs(r.x - geometry[i].x) < 2);
    if (earlier.length) assert.ok(geometry[i].y >= earlier.at(-1).bottom);
  }
  await fs.mkdir(path.join(__dirname, '.codex-tmp'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, '.codex-tmp/avatar-workflow-desktop.png'), fullPage: true });
  await page.locator('[data-action="use-image"]').first().click();
  assert.equal(await page.locator('[data-stage-tab="avatar"]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[name="prompt"]').inputValue(),'Natural gestures');
  assert.equal(submitted.length,3,'choosing an album image never submits');
  await page.locator('[data-stage-tab="avatar"]').focus();
  await page.keyboard.press('End');
  assert.equal(await page.locator('[data-stage-tab="subtitle"]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[name="subtitleResult"]').inputValue(),'Edited subtitle');
  await page.locator('[data-tab="voices"]').click();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-tab="workflows"]').getAttribute('aria-selected'),'true','library keyboard navigation stays in its row');
  assert.equal(await page.locator('[data-section]:visible').count(),0);
  await page.locator('[data-tab="settings"]').click();
  await page.screenshot({path:path.join(__dirname,'.codex-tmp/avatar-header-settings-desktop.png')});
  const second = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await second.route('https://**/*', route => route.abort());
  await second.goto(base + '/?page=avatarWorkflow', { waitUntil: 'domcontentloaded' });
  await second.getByRole('tab', { name: '音色库' }).click();
  await second.getByRole('heading', { name: 'Test voice', exact: true }).waitFor();
  await second.getByRole('tab', { name: '形象相册' }).click();
  await second.locator('.awf-image-card').first().waitFor();
  await second.screenshot({ path: path.join(__dirname, '.codex-tmp/avatar-workflow-mobile.png'), fullPage: true });
  const overflow = await second.locator('.awf').evaluate(el => el.scrollWidth > el.clientWidth + 1);
  assert.equal(overflow, false);
  for(const section of ['speech','avatar','subtitle']) {
    await second.locator('[data-stage-tab="'+section+'"]').click();
    assert.equal(await second.locator('[data-section]:visible').count(),1);
    await second.screenshot({path:path.join(__dirname,'.codex-tmp/avatar-stages-'+section+'-mobile.png')});
    assert.equal(await second.locator('.awf').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
    const headerLayout=await second.evaluate(()=>{
      const elements=[...document.querySelectorAll('.awf-header-title,.awf-library-tabs,.awf-header-actions')].map(el=>el.getBoundingClientRect());
      const main=document.querySelector('.awf-primary-tabs').getBoundingClientRect();
      return {above:elements.every(el=>el.bottom<=main.top),overlap:elements.some((a,i)=>elements.slice(i+1).some(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1))};
    });
    assert.deepEqual(headerLayout,{above:true,overlap:false});
    const columns=await second.locator('[data-section="'+section+'"] .awf-production-columns').first().evaluate(el=>[...el.children].map(c=>{const r=c.getBoundingClientRect();return {bottom:r.bottom,top:r.top};}));
    assert.ok(columns[1].top>=columns[0].bottom);
  }
  assert.deepEqual(errors, []);
});
