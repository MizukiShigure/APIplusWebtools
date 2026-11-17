const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');

test('fresh clone installs a linked skill, updates from Git and preserves private data',{timeout:90000},async t=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-sync-'));
  const upstream=path.join(temporary,'upstream'), clone=path.join(temporary,'recipient with spaces');
  const skills=path.join(temporary,'Agent skills'), data=path.join(temporary,'private data');
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  fs.mkdirSync(upstream);
  for(const name of fs.readdirSync(__dirname)) {
    if ((/\.(?:js|cjs|css|html)$/.test(name) && !name.includes('.test.') && !['extract-history-leveldb.cjs','server-4173.cjs'].includes(name)) || ['VERSION','.gitignore','package.json','Setup_Workbench.ps1'].includes(name)) fs.copyFileSync(path.join(__dirname,name),path.join(upstream,name));
  }
  for(const dir of ['scripts','skills/api-plus-agent']) fs.cpSync(path.join(__dirname,dir),path.join(upstream,dir),{recursive:true,filter:file=>!file.endsWith('.zip')});
  git(upstream,'init','-b','main');git(upstream,'config','user.name','Fixture');git(upstream,'config','user.email','fixture@example.com');
  git(upstream,'add','.');git(upstream,'commit','-m','initial');
  git(temporary,'clone',upstream,clone);
  const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const env={...process.env,API_BATCH_DATA_DIR:'',API_PLUS_WORKBENCH_ROOT:'',API_PLUS_AGENT_BASE_URL:'',API_PLUS_AGENT_TOKEN:'',APPDATA:path.join(temporary,'appdata')};
  let pid;
  async function run(args,options={}) {
    const child=spawn(process.execPath,[path.join(clone,'scripts/workbench-manage.cjs'),...args],{env,cwd:clone,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    if(options.fail) {assert.notEqual(code,0);return stderr;}
    assert.equal(code,0,stderr+'\n'+stdout);return JSON.parse(stdout);
  }
  t.after(async()=>{
    if(pid)try{process.kill(pid);}catch{}
    await new Promise(resolve=>setTimeout(resolve,300));
    // The unique directory was created by this test under os.tmpdir().
    fs.rmSync(temporary,{recursive:true,force:true,maxRetries:6,retryDelay:100});
  });
  const setup=await run(['setup','--port',String(port),'--data-dir',data,'--skills-dir',skills]);
  assert.equal(setup.url,`http://127.0.0.1:${port}/`);
  const caps=await run(['cli','capabilities']);pid=caps.instance.pid;
  assert.equal(caps.instance.root,clone);assert.equal(caps.instance.dataDir,data);
  assert.equal((await fetch(setup.url)).status,200);
  fs.writeFileSync(path.join(data,'private-sentinel.txt'),'preserve local data');
  const link=path.join(skills,'api-plus-agent','.workbench-link.json');
  assert.equal(JSON.parse(fs.readFileSync(link,'utf8')).root,clone);
  const noChange=await run(['sync','--remote','origin']);assert.equal(noChange.updated,false);
  const before=git(clone,'rev-parse','HEAD');
  fs.writeFileSync(path.join(upstream,'VERSION'),'v2099.01.01-fixture.1\n');
  git(upstream,'add','VERSION');git(upstream,'commit','-m','update');
  const result=await run(['sync','--remote','origin']);
  assert.equal(result.updated,true);assert.equal(result.before,before);
  assert.equal(result.commit,git(upstream,'rev-parse','HEAD'));
  assert.equal(result.version,'v2099.01.01-fixture.1');
  assert.equal(fs.readFileSync(path.join(data,'private-sentinel.txt'),'utf8'),'preserve local data');
  assert.equal(fs.readFileSync(path.join(result.backup,'data','private-sentinel.txt'),'utf8'),'preserve local data');
  const updatedCaps=await run(['cli','capabilities']);pid=updatedCaps.instance.pid;
  assert.notEqual(pid,caps.instance.pid);
  assert.equal(updatedCaps.instance.dataDir,data);
  assert.equal(git(clone,'status','--porcelain'),'');
  const installed=execFileSync(process.execPath,[path.join(skills,'api-plus-agent/scripts/workbench.cjs'),'capabilities'],{env,encoding:'utf8',windowsHide:true});
  assert.equal(JSON.parse(installed).instance.pid,pid);
  fs.writeFileSync(path.join(clone,'VERSION'),'local edit');
  assert.match(await run(['sync','--remote','origin'],{fail:true}),/Uncommitted/);
  assert.equal(fs.readFileSync(path.join(clone,'VERSION'),'utf8'),'local edit');
  await run(['stop']);pid=null;
});
