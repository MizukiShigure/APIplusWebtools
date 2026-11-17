// Dependency-free setup/update entry point. Local paths never enter tracked files.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const {execFileSync, spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const { createGatewayConfig } = require('../gateway-config.cjs');
const CONFIG = '.workbench-local.json';
const git = (root, ...args) => execFileSync('git', args, {cwd:root, encoding:'utf8', windowsHide:true, stdio:['ignore','pipe','pipe']}).trim();
const json = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : null;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (a,b) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));

function loadConfig(root=ROOT, env=process.env) {
  const saved=json(path.join(root,CONFIG)) || {};
  const port=Number(saved.port || env.PORT || 4198);
  if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('Invalid local port');
  return {root, node:process.execPath, port,
    dataDir:path.resolve(env.API_BATCH_DATA_DIR || saved.dataDir || (fs.existsSync(path.join(root,'.git')) ? path.join(path.dirname(root),'APIplusWebtools-data') : path.join(root,'data'))),
    skillsDirs:saved.skillsDirs || []};
}
function saveConfig(config) {
  fs.writeFileSync(path.join(config.root,CONFIG),JSON.stringify({schema:1,port:config.port,dataDir:config.dataDir,skillsDirs:config.skillsDirs},null,2)+'\n',{encoding:'utf8',mode:0o600});
}
function skillFiles(config) {
  const launcher = path.join(config.root,'scripts','workbench-manage.cjs');
  return {
    'SKILL.md':`---\nname: api-plus-agent\ndescription: Use APIplusWebtools for media generation, shared browser and Agent history, setup, or synchronizing this installed project with GitHub.\n---\n\n# API Plus Workbench\n\nInstalled checkout: ${config.root}\n\nBefore media operations read [the current skill](${path.join(config.root,'skills/api-plus-agent/SKILL.md').replaceAll('\\','/')}). This link always follows the checkout version.\n\nRun the local Node executable ${config.node} with this skill's scripts/workbench.cjs, followed by the command. On Windows scripts/workbench.ps1 selects the same runtime automatically.\n\n- Media: capabilities, upload, submit, wait, status, history, events, recreate, cancel. Set API_PLUS_AGENT_SOURCE_CLIENT, API_PLUS_AGENT_SOURCE_ID and API_PLUS_AGENT_SOURCE_LABEL for each task. All uploads/submissions go through the workbench so the browser shows their records.\n- User says “同步项目 / update workbench”: read ${path.join(config.root,'docs/GIT_WORKFLOW.md')}, then run sync. A requested sync authorizes fetching and fast-forwarding upstream code, refreshing this skill, and restarting the owned idle service. Preserve local edits and all private data.\n- Installation status: run doctor. If gateway.configured is false, guide the user to enter their administrator-provided gateway into API Base on the local page. The private gateway.json is shared by browser and Agent and retained by sync. Read docs/CHANNEL_CONFIGURATION.md for RunningHub, Suno and other sources. Never add private addresses to public source or recover them from Git history.\n- Contribute changes: follow docs/GIT_WORKFLOW.md in the checkout; prepare a branch and PR for the maintainer to select. Sync never pushes or merges contributions automatically.\n\nOnly this checkout is selected. Do not create another workbench or call providers directly. If this directory moved, run setup from its new location with a new skill destination; preserve the old link until verified.\n`,
    'scripts/workbench.cjs':`const fs=require('node:fs');\nconst path=require('node:path');\nconst {spawnSync}=require('node:child_process');\nconst link=JSON.parse(fs.readFileSync(path.join(__dirname,'../.workbench-link.json'),'utf8'));\nconst args=process.argv.slice(2);\nconst mode=['sync','doctor','setup','stop','configure'].includes(args[0])?[]:['cli'];\nconst result=spawnSync(process.execPath,[path.join(link.root,'scripts/workbench-manage.cjs'),...mode,...args],{stdio:'inherit',windowsHide:true});\nif(result.error)console.error(result.error.message);\nprocess.exit(result.status===null?1:result.status);\n`,
    'scripts/workbench.ps1':`$ErrorActionPreference = 'Stop'\n$link = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../.workbench-link.json') -Raw -Encoding UTF8 | ConvertFrom-Json\n$node = $link.node\nif (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node -ErrorAction Stop).Source }\n& $node (Join-Path $PSScriptRoot 'workbench.cjs') @args\nexit $LASTEXITCODE\n`
  };
}
function checkSkill(config, skillsDir) {
  const target=path.resolve(skillsDir,'api-plus-agent');
  if (!fs.existsSync(target)) return target;
  if (fs.lstatSync(target).isSymbolicLink()) throw new Error(`Existing linked skill is not managed by this installer: ${target}`);
  const manifest=json(path.join(target,'.workbench-link.json'));
  if (!manifest || manifest.schema!==1 || !same(manifest.root,config.root)) throw new Error(`Existing skill belongs to another installation: ${target}. Choose --skills-dir or preserve and rename it first.`);
  for (const [name,digest] of Object.entries(manifest.files || {})) {
    if (!Object.hasOwn(skillFiles(config),name)) throw new Error('Invalid managed skill manifest');
    const file=path.join(target,name);
    if (!fs.existsSync(file) || hash(fs.readFileSync(file))!==digest) throw new Error(`Managed skill was edited: ${file}. Preserve the edits before setup/sync.`);
  }
  return target;
}
function installSkill(config, skillsDir) {
  const target=checkSkill(config,skillsDir), files=skillFiles(config), hashes={};
  for (const [name,contents] of Object.entries(files)) {
    const file=path.join(target,name);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,contents,'utf8'); hashes[name]=hash(contents);
  }
  fs.writeFileSync(path.join(target,'.workbench-link.json'),JSON.stringify({schema:1,root:config.root,node:config.node,files:hashes},null,2)+'\n','utf8');
  return target;
}
function environment(config) {
  return {...process.env, API_PLUS_WORKBENCH_ROOT:config.root, API_BATCH_DATA_DIR:config.dataDir,
    API_PLUS_AGENT_BASE_URL:`http://127.0.0.1:${config.port}/api/agent/v1`, PORT:String(config.port), HOST:'127.0.0.1'};
}
async function listening(port) {
  return new Promise(resolve=>{
    const socket=net.connect({host:'127.0.0.1',port});
    const done=value=>{socket.destroy();resolve(value);};
    socket.setTimeout(1000,()=>done(true)); socket.once('connect',()=>done(true));
    socket.once('error',error=>done(error.code!=='ECONNREFUSED'));
  });
}
async function service(config) {
  if (!await listening(config.port)) return null;
  const response=await fetch(`http://127.0.0.1:${config.port}/api/agent/v1/capabilities`,{headers:{'X-API-Plus-Client':'cli-v1'},signal:AbortSignal.timeout(3000)});
  if (!response.ok) throw new Error('Port is occupied by an incompatible service; inspect ownership before updating');
  const caps=await response.json(), instance=caps.instance;
  if (!instance || !same(instance.root,config.root) || !same(instance.dataDir,config.dataDir) || !Number.isInteger(instance.pid)) throw new Error('Port belongs to a different installation or data directory');
  return caps;
}
function assertIdle(dataDir) {
  const tasks=json(path.join(dataDir,'tasks','snapshot.json'));
  const registry=json(path.join(dataDir,'avatar-workflow','registry.json'));
  const pending=[...Object.values(tasks?.state?.tasksById || {}),...Object.values(registry?.collections?.jobs || {})]
    .filter(task=>!['completed','failed','canceled','partial'].includes(task.state));
  if (pending.length) throw new Error(`Updates blocked by ${pending.length} active or uncertain task(s): ${pending.map(x=>x.state).join(', ')}. Wait/recover the existing task IDs before syncing.`);
}
async function stop(config) {
  const caps=await service(config);
  assertIdle(config.dataDir);
  if (!caps) return;
  process.kill(caps.instance.pid);
  for(let i=0;i<40;i++) {await pause(100);if(!await listening(config.port)) break;}
  await pause(1000);
  if (await listening(config.port)) throw new Error('Service is still running or a supervisor restarted it. Stop its owning PM2/service before sync. No code has changed.');
}
function assertSyncReady(root, target) {
  if (!fs.existsSync(path.join(root,'.git'))) throw new Error('Git clone is required to sync this ZIP snapshot.');
  if (git(root,'branch','--show-current')!=='main') throw new Error('Sync requires main. Preserve your topic branch and switch to main first.');
  if (git(root,'status','--porcelain','--untracked-files=normal')) throw new Error('Uncommitted local changes found. Preserve them on a contribution branch before sync; no reset or automatic stash was performed.');
  if (target) {
    try {git(root,'merge-base','--is-ancestor','HEAD',target);}
    catch {throw new Error('Local main is ahead or diverged. Preserve local commits on a contribution branch; automatic update stopped.');}
  }
}
function updateRemote(root, explicit) {
  if (explicit && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(explicit)) throw new Error('Invalid remote name');
  const remotes=git(root,'remote').split(/\r?\n/);
  if (explicit) {if(!remotes.includes(explicit))throw new Error('Remote not found');return explicit;}
  for (const name of ['upstream','origin']) {
    if (remotes.includes(name) && /^(?:https:\/\/github\.com\/|git@github\.com:)MizukiShigure\/APIplusWebtools(?:\.git)?\/?$/i.test(git(root,'remote','get-url',name))) return name;
  }
  throw new Error('Official remote missing. Add upstream https://github.com/MizukiShigure/APIplusWebtools.git, or explicitly select --remote after reviewing it.');
}
async function setup(config) {
  if (!config.skillsDirs.length) config.skillsDirs=[path.join(os.homedir(),'.codex','skills')];
  for(const dir of config.skillsDirs) checkSkill(config,dir);
  const client=await import(pathToFileURL(path.join(config.root,'skills/api-plus-agent/scripts/api-plus-agent-client.mjs')));
  await client.ensureLocalService(environment(config));
  const skills=config.skillsDirs.map(dir=>installSkill(config,dir));
  saveConfig(config);
  const gateway=createGatewayConfig({dataDir:config.dataDir}).status();
  return {success:true,version:fs.readFileSync(path.join(config.root,'VERSION'),'utf8').trim(),url:`http://127.0.0.1:${config.port}/`,dataDir:config.dataDir,skills,gateway,
    ...(!gateway.configured ? {nextStep:'Ask the user to enter their administrator-provided gateway in API Base on the local page. It is saved privately for browser and Agent use.'} : {})};
}
async function sync(config,options={}) {
  assertSyncReady(config.root);
  for(const dir of config.skillsDirs) checkSkill(config,dir);
  const remote=updateRemote(config.root,options.remote);
  git(config.root,'fetch',remote,'main');
  const before=git(config.root,'rev-parse','HEAD'), after=git(config.root,'rev-parse','FETCH_HEAD');
  assertSyncReady(config.root,after);
  if (before===after) return {...await setup(config),updated:false,commit:after};
  await stop(config); assertIdle(config.dataDir);
  const backup=path.join(config.root,'.workbench-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+before.slice(0,8));
  fs.mkdirSync(backup,{recursive:true});
  // Never put the destination inside the data tree or recursively copy the source tree.
  const relative=path.relative(config.dataDir,backup);
  if (!relative.startsWith('..'+path.sep) && !path.isAbsolute(relative)) throw new Error('Backup would be inside data directory; choose a separate private data directory.');
  if (fs.existsSync(config.dataDir)) fs.cpSync(config.dataDir,path.join(backup,'data'),{recursive:true,errorOnExist:true,force:false});
  fs.writeFileSync(path.join(backup,'update.json'),JSON.stringify({before,after,dataDir:config.dataDir},null,2));
  git(config.root,'merge','--ff-only',after);
  // Run the newly pulled setup code, not an old in-memory installer.
  const output=execFileSync(process.execPath,[path.join(config.root,'scripts/workbench-manage.cjs'),'setup'],{cwd:config.root,env:environment(config),encoding:'utf8',windowsHide:true});
  return {...JSON.parse(output),updated:true,before,commit:after,backup};
}
async function main(args=process.argv.slice(2)) {
  if(Number(process.versions.node.split('.')[0])<20) throw new Error('Node.js 20+ required; Windows users can run Setup_Workbench.ps1');
  const command=args.shift() || 'doctor', config=loadConfig();
  if(command==='cli') {
    const child=spawn(process.execPath,[path.join(ROOT,'skills/api-plus-agent/scripts/api-plus-agent-client.mjs'),...args],{env:environment(config),stdio:'inherit',windowsHide:true});
    child.once('error',error=>{console.error(error.message);process.exitCode=1;});
    child.once('exit',code=>{process.exitCode=code===null?1:code;}); return;
  }
  const opts={};
  while(args.length) {const flag=args.shift(); if(!['--skills-dir','--port','--data-dir','--remote','--gateway-file'].includes(flag) || !args.length)throw new Error(`Unknown/missing option: ${flag}`);opts[flag.slice(2)]=args.shift();}
  if(opts['skills-dir']) config.skillsDirs=[...new Set([...config.skillsDirs,path.resolve(opts['skills-dir'])])];
  if(opts['data-dir']) config.dataDir=path.resolve(opts['data-dir']);
  if(opts.port) {config.port=Number(opts.port);if(!Number.isInteger(config.port)||config.port<1||config.port>65535)throw new Error('Invalid port');}
  let result;
  if(command==='configure') {
    const gateway=createGatewayConfig({dataDir:config.dataDir});
    if((await service(config))?.gateway?.source==='environment') throw new Error('API Base is controlled by the running service environment; update or remove that override first');
    if(!opts['gateway-file']) throw new Error('Enter API Base on the local workbench page, or use configure --gateway-file <private UTF-8 file containing the URL>');
    gateway.save(fs.readFileSync(path.resolve(opts['gateway-file']),'utf8').replace(/^\uFEFF/,''));
    saveConfig(config);
    result={success:true,gateway:gateway.status()};
  }
  else if(command==='setup') result=await setup(config);
  else if(command==='sync') result=await sync(config,opts);
  else if(command==='stop') {await stop(config);result={success:true,stopped:true};}
  else if(command==='doctor') {const caps=await service(config);result={...config,running:!!caps,version:fs.readFileSync(path.join(ROOT,'VERSION'),'utf8').trim(),execution:caps?.execution || null,gateway:caps?.gateway || createGatewayConfig({dataDir:config.dataDir}).status()};}
  else throw new Error('Commands: setup, configure, sync, doctor, stop, cli <media command>');
  console.log(JSON.stringify(result,null,2));
}
module.exports={loadConfig,saveConfig,installSkill,checkSkill,assertSyncReady,assertIdle,updateRemote,setup,sync,service,stop};
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({success:false,error:error.message}));process.exitCode=1;});
