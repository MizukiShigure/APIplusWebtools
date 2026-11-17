const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const manage = require('./scripts/workbench-manage.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-manage-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  return root;
}
const git = (root, ...args) => execFileSync('git', args, {cwd:root, encoding:'utf8', windowsHide:true, stdio:['ignore','pipe','pipe']}).trim();

test('installed skill follows the selected checkout and preserves user edits', t => {
  const root = fixture(t), skills = path.join(root, 'Agent skills');
  const config = {root, node:process.execPath, port:4321, dataDir:path.join(root,'private')};
  const target = manage.installSkill(config, skills);
  const entry = fs.readFileSync(path.join(target,'SKILL.md'),'utf8');
  assert.ok(entry.includes(root));
  assert.ok(entry.includes('sync'));
  assert.ok(fs.existsSync(path.join(target,'scripts','workbench.cjs')));
  manage.installSkill(config, skills);
  fs.appendFileSync(path.join(target,'SKILL.md'),'\nPersonal edit');
  assert.throws(() => manage.installSkill(config, skills), /modified|edited/i);
  assert.ok(fs.readFileSync(path.join(target,'SKILL.md'),'utf8').endsWith('Personal edit'));
});

test('setup refuses to replace an unrelated existing skill', t => {
  const root=fixture(t), skills=path.join(root,'skills');
  fs.mkdirSync(path.join(skills,'api-plus-agent'),{recursive:true});
  fs.writeFileSync(path.join(skills,'api-plus-agent','SKILL.md'),'Existing skill');
  assert.throws(()=>manage.installSkill({root,node:process.execPath},skills),/existing|managed/i);
});

test('configuration retains a stable port, data directory and skill locations', t => {
  const root=fixture(t);
  fs.mkdirSync(path.join(root,'.git'));
  const initial=manage.loadConfig(root,{});
  assert.equal(initial.port,4198);
  assert.equal(initial.dataDir,path.join(path.dirname(root),'APIplusWebtools-data'));
  manage.saveConfig({...initial,port:4308,dataDir:path.join(root,'private'),skillsDirs:[path.join(root,'skills')]});
  const next=manage.loadConfig(root,{});
  assert.equal(next.port,4308);
  assert.equal(next.dataDir,path.join(root,'private'));
  assert.deepEqual(next.skillsDirs,[path.join(root,'skills')]);
});

test('sync checks refuse dirty trees, topic branches and divergent local commits', t => {
  const root=fixture(t);
  git(root,'init','-b','main'); git(root,'config','user.name','Test'); git(root,'config','user.email','test@example.com');
  fs.writeFileSync(path.join(root,'source.txt'),'v1'); git(root,'add','source.txt'); git(root,'commit','-m','initial');
  const base=git(root,'rev-parse','HEAD');
  manage.assertSyncReady(root,base);
  fs.appendFileSync(path.join(root,'source.txt'),'local');
  assert.throws(()=>manage.assertSyncReady(root,base),/uncommitted/i);
  git(root,'add','source.txt'); git(root,'commit','-m','local');
  assert.throws(()=>manage.assertSyncReady(root,base),/ahead|diverged/i);
  git(root,'switch','-c','feature');
  assert.throws(()=>manage.assertSyncReady(root,git(root,'rev-parse','HEAD')),/main/i);
});

test('running and uncertain tasks block updates; completed tasks do not', t => {
  const root=fixture(t);
  fs.mkdirSync(path.join(root,'tasks'));
  const file=path.join(root,'tasks','snapshot.json');
  fs.writeFileSync(file,JSON.stringify({state:{tasksById:{a:{taskId:'a',state:'running'}}}}));
  assert.throws(()=>manage.assertIdle(root),/active|running/i);
  fs.writeFileSync(file,JSON.stringify({state:{tasksById:{a:{taskId:'a',state:'submission-unknown'}}}}));
  assert.throws(()=>manage.assertIdle(root),/uncertain|active/i);
  fs.writeFileSync(file,JSON.stringify({state:{tasksById:{a:{taskId:'a',state:'completed'}}}}));
  manage.assertIdle(root);
  fs.mkdirSync(path.join(root,'avatar-workflow'));
  fs.writeFileSync(path.join(root,'avatar-workflow','registry.json'),JSON.stringify({collections:{jobs:{a:{id:'a',state:'polling'}}}}));
  assert.throws(()=>manage.assertIdle(root),/active|polling/i);
});
