const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const clientFile = path.join(__dirname, 'skills/api-plus-agent/scripts/api-plus-agent-client.mjs');
const { pathToFileURL } = require('node:url');

test('client uses native header without token and uploads original path plus source identity', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'headless-client-'));
  const file = path.join(root, 'sample.txt');
  await fs.writeFile(file, 'sample');
  const seen = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    seen.push({ headers: req.headers, path: req.url, body: Buffer.concat(chunks).toString() });
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  const child = spawn(process.execPath, [clientFile, 'upload', file], { windowsHide: true, env: { ...process.env, API_PLUS_AGENT_TOKEN: '', API_PLUS_AGENT_BASE_URL: `http://127.0.0.1:${server.address().port}/api/agent/v1`, API_PLUS_AGENT_AUTOSTART: '0', API_PLUS_AGENT_SOURCE_ID: 'tester', API_PLUS_AGENT_SOURCE_CLIENT: 'mcode' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', c => output += c);
  const code = await new Promise(resolve => child.once('exit', resolve));
  assert.equal(code, 0, output);
  assert.equal(seen[0].headers['x-api-plus-client'], 'cli-v1');
  assert.equal(seen[0].headers.authorization, undefined);
  assert.ok(seen[0].body.includes(file.replaceAll('\\', '\\\\')));
  assert.ok(seen[0].body.includes('"id":"tester"'));
});

test('CLI resolves bundled workbench and source checkout data directory without manual config', async () => {
  const client = await import(pathToFileURL(clientFile));
  assert.equal(typeof client.resolveWorkbench, 'function');
  const resolved = client.resolveWorkbench({});
  assert.equal(resolved.root, __dirname);
  assert.equal(resolved.server, path.join(__dirname, 'server.cjs'));
  assert.equal(resolved.dataDir, path.join(path.dirname(__dirname), 'APIplusWebtools-data'));
});

test('explicit installation root never silently connects to another workbench on the same port', async t => {
  const client = await import(pathToFileURL(clientFile));
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ execution: 'headless', instance: { root: path.join(__dirname, 'another-installation'), dataDir: path.join(__dirname, 'wrong-data') } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await assert.rejects(client.ensureLocalService({ API_PLUS_WORKBENCH_ROOT: __dirname, API_PLUS_AGENT_BASE_URL: `http://127.0.0.1:${server.address().port}/api/agent/v1` }), /different installation|mismatch/i);
  const child = spawn(process.execPath, [clientFile, 'capabilities'], { windowsHide: true, env: { ...process.env, API_PLUS_AGENT_TOKEN: '', API_PLUS_AGENT_AUTOSTART: '0', API_PLUS_WORKBENCH_ROOT: __dirname, API_PLUS_AGENT_BASE_URL: `http://127.0.0.1:${server.address().port}/api/agent/v1` }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', value => output += value);
  const code = await new Promise(resolve => child.once('exit', resolve));
  assert.equal(code, 1, 'Disabling auto-start must not disable installation validation');
  assert.equal(JSON.parse(output).error, 'installation_mismatch');
});

test('client error output redacts bearer tokens from nested response details', async t => {
  const token = ['temporary','test','token'].join('-');
  const server = http.createServer((req,res) => { res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'rejected',message:'Rejected',detail:{echo:token}})); });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const child=spawn(process.execPath,[clientFile,'capabilities'],{windowsHide:true,env:{...process.env,API_PLUS_AGENT_TOKEN:token,API_PLUS_AGENT_AUTOSTART:'0',API_PLUS_AGENT_BASE_URL:`http://127.0.0.1:${server.address().port}/api/agent/v1`},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',value=>output+=value);
  assert.equal(await new Promise(resolve=>child.once('close',resolve)),1);
  assert.equal(output.includes(token),false);
});

test('CLI auto-starts a hidden local server, uploads, generates and recreates through the real HTTP service', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'headless-e2e-'));
  // A fresh data directory alone still permits the legacy project history
  // recovery source. Use a clean source copy before exercising the real browser.
  const checkout = path.join(root, 'checkout');
  await fs.mkdir(checkout);
  for (const name of await fs.readdir(__dirname)) {
    if ((/\.(js|cjs|css|html)$/.test(name) && !name.includes('.test.') && !['extract-history-leveldb.cjs','server-4173.cjs'].includes(name)) || ['VERSION','package.json'].includes(name)) await fs.copyFile(path.join(__dirname,name),path.join(checkout,name));
  }
  await fs.cp(path.join(__dirname,'skills/api-plus-agent'),path.join(checkout,'skills/api-plus-agent'),{recursive:true,filter:file=>!file.endsWith('.zip')});
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  let submissions = 0;
  const gateway = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url === '/api/fileupload') { res.end(JSON.stringify({ success: true, data: { url: 'https://cdn.example/source.png' } })); return; }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (req.url === '/api/nano_banana_image') {
      assert.equal(body.prompt, 'Exact test prompt');
      assert.deepEqual(body.image_urls, ['https://cdn.example/source.png']);
      submissions++; res.end(JSON.stringify({ success: true, data: { task_id: `remote-${submissions}` } })); return;
    }
    assert.equal(req.url, '/api/nano_banana_image_query');
    res.end(JSON.stringify({ success: true, data: { image_url: `https://cdn.example/${body.task_id}.png` } }));
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, API_PLUS_WORKBENCH_ROOT: checkout, APPDATA: path.join(root, 'appdata'), API_PLUS_AGENT_SOURCE_CLIENT: 'codex', API_PLUS_AGENT_SOURCE_ID: 'browser-history-fixture', API_PLUS_AGENT_SOURCE_LABEL: 'Agent history fixture', API_PLUS_AGENT_TOKEN: '', API_PLUS_AGENT_AUTOSTART: '1', API_PLUS_AGENT_BASE_URL: `http://127.0.0.1:${port}/api/agent/v1`, API_BATCH_DATA_DIR: path.join(root, 'data'), API_PLUS_GATEWAY_BASE: `http://127.0.0.1:${gateway.address().port}/api` };
  let serverPid;
  t.after(async () => {
    if (serverPid) { try { process.kill(serverPid); } catch {} }
    gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve));
    await new Promise(resolve => setTimeout(resolve, 150));
    await fs.rm(root, { recursive: true, force: true });
  });
  async function cli(args, wrapper = false) {
    const executable = wrapper && process.platform === 'win32' ? 'powershell.exe' : process.execPath;
    const commandArgs = wrapper && process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(path.dirname(clientFile), 'run-workbench.ps1'), ...args] : [clientFile, ...args];
    const child = spawn(executable, commandArgs, { env, cwd: __dirname, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', c => {
      output += c;
      try { const payload = JSON.parse(output); if (payload.instance?.dataDir === env.API_BATCH_DATA_DIR) serverPid = payload.instance.pid; } catch {}
    });
    const code = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('CLI did not close its output pipes')); }, 12000);
      child.once('close', code => { clearTimeout(timeout); resolve(code); });
    });
    assert.equal(code, 0, output); return JSON.parse(output);
  }
  const caps = await cli(['capabilities'], true);
  assert.equal(caps.execution, 'headless');
  assert.equal(caps.instance.dataDir, env.API_BATCH_DATA_DIR);
  serverPid = caps.instance.pid;
  const source = path.join(root, 'source.png'); await fs.writeFile(source, 'isolated upload bytes');
  const { asset } = await cli(['upload', source]);
  const inputFile = path.join(root, 'task.json');
  await fs.writeFile(inputFile, JSON.stringify({ model: 'nano', prompt: 'Exact test prompt', assets: { images: [asset] } }));
  const submitArgs = ['submit', '--task-type', 'image', '--input', '@' + inputFile, '--client-task-id', 'end-to-end'];
  const first = await cli(submitArgs);
  const done = await cli(['wait', first.task.taskId, '--interval', '250', '--timeout', '5000']);
  assert.equal(done.task.state, 'completed', done.task.error?.message);
  assert.equal(done.history.find(record => record.kind === 'generation').params.prompt, 'Exact test prompt');
  assert.equal((await cli(submitArgs)).task.taskId, first.task.taskId);
  assert.equal(submissions, 1);
  const repeat = await cli(['recreate', first.task.taskId]);
  assert.notEqual(repeat.task.taskId, first.task.taskId);
  const reroll = await cli(['wait', repeat.task.taskId, '--interval', '250', '--timeout', '5000']);
  assert.equal(reroll.task.state, 'completed', reroll.task.error?.message);
  assert.equal(submissions, 2);
  assert.equal((await cli(['events', first.task.taskId])).events.some(event => event.type === 'task-execution-updated'), true);
  if (process.env.PROMPT_LIBRARY_PLAYWRIGHT) {
    const { chromium } = require(process.env.PROMPT_LIBRARY_PLAYWRIGHT);
    const browser = await chromium.launch({headless:true,channel:process.env.AWF_BROWSER_CHANNEL || 'chrome'});
    try {
      const page = await browser.newPage({viewport:{width:1440,height:1000}});
      const errors=[],pending=new Set(); page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>pending.add(request.url()));
      page.on('requestfinished',request=>pending.delete(request.url()));
      page.on('requestfailed',request=>pending.delete(request.url()));
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='127.0.0.1') return route.continue();
        return route.fulfill({status:200,contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
      });
      await page.goto(`http://127.0.0.1:${port}/`);
      assert.equal(errors.length,0,JSON.stringify(errors));
      try { await page.locator('[data-page="history"]').click({timeout:10000}); }
      catch(error) { throw new Error(`${error.message}; pending=${JSON.stringify([...pending])}; body=${(await page.locator('body').innerText()).slice(0,1000)}; errors=${JSON.stringify(errors)}`); }
      await page.locator('#historyGenerationsTab').click();
      await page.getByText('Exact test prompt',{exact:false}).first().waitFor();
      const options=await page.locator('#historyOriginFilter option').allTextContents();
      assert.ok(options.some(label=>/Agent history fixture|Codex|codex/.test(label)),JSON.stringify(options));
      await page.locator('.history-audit-details summary').first().click();
      const detail=await page.locator('.history-audit-details pre').first().innerText();
      assert.match(detail,/Exact test prompt/);assert.match(detail,/source\.png/);
      if (process.env.WORKBENCH_CAPTURE_SCREENSHOTS === '1') {
        await fs.mkdir(path.join(__dirname,'.codex-tmp'),{recursive:true});
        await page.screenshot({path:path.join(__dirname,'.codex-tmp/agent-history-browser.png'),fullPage:true});
      }
      assert.deepEqual(errors,[]);
    } finally {await browser.close();}
  }
});
