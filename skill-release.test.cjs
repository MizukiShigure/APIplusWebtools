const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const root = __dirname;
const ps = (args, options = {}) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024, ...options });
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
const cleanup = dir => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.match(path.basename(dir), /^api-skill-release-/); fs.rmSync(dir, { recursive: true, force: true }); };

test('skill wrappers forward flags and Unicode paths to the selected installed client', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'api-skill-release-wrapper-'));
  try {
    const install = path.join(temp, 'workbench with spaces');
    const scripts = path.join(install, 'skills/api-plus-agent/scripts');
    fs.mkdirSync(scripts, { recursive: true });
    fs.copyFileSync(path.join(root, 'skills/api-plus-agent/scripts/run-workbench.ps1'), path.join(scripts, 'run-workbench.ps1'));
    fs.writeFileSync(path.join(scripts, 'api-plus-agent-client.mjs'), 'console.log(JSON.stringify({args:process.argv.slice(2),root:process.env.API_PLUS_WORKBENCH_ROOT}));');
    const wanted = ['upload', path.join(temp, '\u7d20\u6750 clip.wav'), '--media-type', 'audio'];
    for (const wrapper of [path.join(root, 'skills/api-plus-agent/scripts/run-workbench.ps1'), path.join(root, 'skills/local-api-workbench/scripts/workbench.ps1')].filter(fs.existsSync)) {
      const result = JSON.parse(ps(['-File', wrapper, ...wanted], { env: { ...process.env, API_PLUS_WORKBENCH_ROOT: install, PATH: `${path.dirname(process.execPath)};${process.env.PATH}` } }));
      assert.deepEqual(result.args, wanted);
      assert.equal(result.root, install);
    }
  } finally { cleanup(temp); }
});

test('full skill extracts a clean licensed workbench and starts tokenless without a browser', { skip: !process.env.PORTABLE_TEST_NODE }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'api-skill-release-full-'));
  let port;
  let installedRoot;
  try {
    const releaseDir = path.join(temp, 'release');
    const includeLocal = fs.existsSync(path.join(root, 'skills/local-api-workbench/SKILL.md'));
    ps(['-File', path.join(root, 'scripts/build-skills.ps1'), '-OutputDirectory', releaseDir, '-NodeRuntimePath', process.env.PORTABLE_TEST_NODE, '-NodeLicensePath', process.env.PORTABLE_TEST_LICENSE, ...(includeLocal ? ['-IncludeLocalSkill'] : [])]);
    const release = JSON.parse(fs.readFileSync(path.join(releaseDir, 'SKILL_RELEASE.json'), 'utf8'));
    for (const artifact of release.artifacts) assert.equal(hash(path.join(releaseDir, artifact.name)), artifact.sha256);
    if (includeLocal) {
      assert.deepEqual(files(path.join(releaseDir, 'local-api-workbench')).sort(), ['SKILL.md', 'agents/openai.yaml', 'scripts/workbench.ps1']);
      assert.ok(fs.statSync(path.join(releaseDir, release.artifacts.find(x => !x.containsWorkbench).name)).size < 32768);
    }
    const outer = path.join(temp, 'installed-skill');
    ps(['-Command', `Expand-Archive -LiteralPath ${quote(path.join(releaseDir, release.artifacts.find(x => x.containsWorkbench).name))} -DestinationPath ${quote(outer)}`]);
    const skill = path.join(outer, 'api-plus-agent');
    const nested = path.join(skill, 'assets/workbench.zip');
    const manifest = JSON.parse(fs.readFileSync(path.join(skill, 'assets/workbench-manifest.json'), 'utf8'));
    assert.equal(hash(nested), manifest.sha256);
    installedRoot = path.join(skill, 'workbench', manifest.version);
    const listener = net.createServer();
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const env = { ...process.env, API_PLUS_WORKBENCH_ROOT: '', API_PLUS_AGENT_TOKEN: '', API_PLUS_AGENT_AUTOSTART: '1', API_PLUS_AGENT_BASE_URL: `http://127.0.0.1:${port}/api/agent/v1`, API_BATCH_DATA_DIR: path.join(temp, 'isolated-data'), API_BATCH_NO_BROWSER: '1' };
    const result = JSON.parse(ps(['-File', path.join(skill, 'scripts/run-workbench.ps1'), 'capabilities'], { env, cwd: temp, timeout: 90000 }));
    assert.equal(result.apiVersion, 'v1');
    assert.equal(result.execution, 'headless');
    assert.equal(path.resolve(result.instance.root), path.resolve(installedRoot));
    assert.equal(path.resolve(result.instance.dataDir), path.join(temp, 'isolated-data'));
    assert.ok(JSON.stringify(result).includes('multiVideo'), 'live extracted service must expose models');
    const contents = files(installedRoot);
    assert.ok(!contents.some(file => /(?:local-api-workbench|\.jsonl$|agent-auth\.json|workbench\.zip|\/research\/|\/logs\/)/.test(file)), 'embedded package contains private/recursive state');
    assert.deepEqual(fs.readdirSync(path.join(installedRoot, 'data')), ['.keep']);
    assert.equal(hash(path.join(installedRoot, 'runtime/node.exe')), hash(process.env.PORTABLE_TEST_NODE));
    assert.equal(hash(path.join(installedRoot, 'runtime/LICENSE')), hash(process.env.PORTABLE_TEST_LICENSE));
    const build = JSON.parse(fs.readFileSync(path.join(installedRoot, 'PORTABLE_BUILD.json'), 'utf8'));
    assert.equal(build.runtime.sha256, hash(process.env.PORTABLE_TEST_NODE));
    const history = await fetch(`http://127.0.0.1:${port}/api/agent/v1/history`, { headers: { 'X-API-Plus-Client': 'cli-v1' }, signal: AbortSignal.timeout(10000) });
    assert.equal(history.status, 200, 'fresh extracted service must accept tokenless history reads');
    const historyJson = await history.json();
    assert.equal(historyJson.success, true);
  } finally {
    if (port && installedRoot) {
      ps(['-Command', `$owned = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($processId in $owned) { $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"; if ($processInfo.CommandLine -and $processInfo.CommandLine.Contains(${quote(installedRoot)})) { Stop-Process -Id $processId -Force } }`]);
    }
    cleanup(temp);
  }
});
