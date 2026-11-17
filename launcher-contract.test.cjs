const fs = require("fs");
const path = require("path");
const { execFileSync, spawn, spawnSync } = require("child_process");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readRequired(file) {
  assert(fs.existsSync(file), `${file} is missing`);
  return fs.readFileSync(file, "utf8");
}

const ecosystemSource = readRequired("ecosystem.config.cjs");
const ecosystem = require("./ecosystem.config.cjs");
const start = readRequired("Start_API_Tool.bat");
const stop = readRequired("Stop_API_Tool.bat");
const portQuery = fs.existsSync("launcher-port-query.ps1") ? fs.readFileSync("launcher-port-query.ps1", "utf8") : "";
const pm2Owner = fs.existsSync("launcher-pm2-owner.ps1") ? fs.readFileSync("launcher-pm2-owner.ps1", "utf8") : "";
const legacyStart = readRequired("start_multimodal_video_dev.bat");
const readmeStart = readRequired("README_START.txt");
const readme = readRequired("README.md");
const packageJson = JSON.parse(readRequired("package.json"));
const scripts = [start, stop, legacyStart].join("\n");
const personalNodePath = ["Users", "46055"].join("\\");
const codexRuntimePath = ["codex", "runtimes"].join("-");
const projectServerPath = `${__dirname}\\server.cjs`;

function classifyLauncherProcess(processName, commandLine) {
  const commandLineBase64 = Buffer.from(commandLine, "utf8").toString("base64");
  return execFileSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "launcher-port-query.ps1",
    "-ProjectServerPath", projectServerPath,
    "-ClassifyOnly",
    "-ClassifyProcessName", processName,
    "-ClassifyCommandLineBase64", commandLineBase64
  ], { encoding: "utf8" }).trim();
}

function invokePortQuery(extraArgs = [], options = {}) {
  return spawnSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "launcher-port-query.ps1",
    "-Port", String(options.port || 61998),
    "-ProjectServerPath", projectServerPath,
    ...extraArgs
  ], { encoding: "utf8" });
}

function startTcpListenerFixture() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "-e",
      "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>console.log(s.address().port));"
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", code => reject(new Error(`listener fixture exited early (${code}): ${stderr}`)));
    child.stdout.once("data", chunk => {
      const port = Number(String(chunk).trim());
      if (!Number.isInteger(port) || port < 1) {
        child.kill();
        reject(new Error(`listener fixture returned invalid port: ${chunk}`));
        return;
      }
      resolve({ child, port });
    });
  });
}

assert(Array.isArray(ecosystem.apps) && ecosystem.apps.length === 1, "PM2 config must define one app");
const app = ecosystem.apps[0];
assert(app.name === "api-plus-webtools", "PM2 app name must be api-plus-webtools");
assert(app.script === "server.cjs", "PM2 must run server.cjs");
assert(app.cwd === __dirname, "PM2 cwd must be the project directory");
assert(app.env.HOST === "127.0.0.1", "PM2 must bind to 127.0.0.1");
assert(app.env.PORT === 4198 || ecosystemSource.includes("process.env.PORT || 4198"), "PM2 must default PORT to 4198");
assert(app.autorestart === true, "PM2 must autorestart the app");
assert(app.watch === false, "PM2 watch mode must be disabled");
assert(typeof ecosystem.resolveLauncherDataDirectory === "function", "PM2 config must expose deterministic data-directory selection");
const launcherDataFixture = fs.mkdtempSync(path.join(require("os").tmpdir(), "api-plus-launcher-data-"));
try {
  assert(
    path.resolve(ecosystem.resolveLauncherDataDirectory(launcherDataFixture, {})) === path.resolve(launcherDataFixture, "data"),
    "portable installs without .git must default to their local data directory"
  );
  fs.writeFileSync(path.join(launcherDataFixture, ".git"), "gitdir: fixture", "utf8");
  assert(
    path.resolve(ecosystem.resolveLauncherDataDirectory(launcherDataFixture, {})) === path.resolve(launcherDataFixture, "..", "APIplusWebtools-data"),
    "Git worktrees must default to the external sibling data directory"
  );
  assert(
    path.resolve(ecosystem.resolveLauncherDataDirectory(launcherDataFixture, { API_BATCH_DATA_DIR: path.join(launcherDataFixture, "override") })) === path.resolve(launcherDataFixture, "override"),
    "an explicit API_BATCH_DATA_DIR must override launcher defaults"
  );
} finally {
  fs.rmSync(launcherDataFixture, { recursive: true, force: true });
}

assert(start.includes('set "HOST=127.0.0.1"'), "launcher must explicitly bind the local service to loopback");
assert(start.includes('set "API_BATCH_REMOTE_ACCESS=false"'), "launcher must keep private remote access disabled");
assert(start.includes('if not defined API_BATCH_DATA_DIR'), "launcher must preserve an explicit data-directory override");
assert(start.includes('if exist "%~dp0.git"'), "launcher must distinguish a Git checkout from a portable install");
assert(start.includes(String.raw`set "API_BATCH_DATA_DIR=%~dp0..\APIplusWebtools-data"`), "Git checkout must use the external sibling data directory");
assert(start.includes('set "API_BATCH_DATA_DIR=%~dp0data"'), "portable install must fall back to its packaged data directory");
assert(start.includes('if not exist "%API_BATCH_DATA_DIR%"'), "launcher must create the selected data directory");
assert(start.includes("where node"), "launcher must discover Node from PATH");
assert(start.includes("runtime\\node.exe"), "launcher must discover project runtime Node");
assert(start.includes("C:\\Program Files\\nodejs\\node.exe"), "launcher must discover Program Files Node");
assert(start.includes("node_modules\\.bin\\pm2"), "launcher must discover project PM2 bin");
assert(start.includes("node_modules\\pm2\\bin\\pm2"), "launcher must discover project PM2 JS entry");
assert(start.includes("where pm2"), "launcher must discover PM2 from PATH");
assert(start.includes("%APPDATA%\\npm\\pm2.cmd"), "launcher must discover AppData PM2 command");
assert(start.includes("%APPDATA%\\npm\\node_modules\\pm2\\bin\\pm2"), "launcher must discover AppData PM2 JS entry");
assert(start.includes("startOrReload ecosystem.config.cjs --only api-plus-webtools"), "launcher must use idempotent PM2 reload");
assert(start.includes("%NODE_EXE%") && start.includes("PM2_JS"), "JS-only PM2 entries must run through the discovered Node");
assert(start.includes("launcher-node.ps1") && readRequired("launcher-node.ps1").includes("-WindowStyle Hidden"), "launcher must retain a hidden, logged Node fallback");
assert(!start.includes('findstr ":%PORT%"') && !stop.includes('findstr ":%PORT%"'), "launchers must not prefix-match a port with findstr");
assert(portQuery, "launcher-port-query.ps1 is missing");
assert(start.includes("launcher-port-query.ps1") && stop.includes("launcher-port-query.ps1"), "launchers must use the exact-port query helper");
assert(portQuery.includes("Get-NetTCPConnection -State Listen -LocalPort"), "port query must use exact listening TCP port lookup");
assert(portQuery.includes("netstat.exe"), "port query must fall back to exact netstat listener parsing");
assert(portQuery.includes("QUERY_FAILED=1"), "port query must report an explicit fail-closed state when all probes fail");
assert(portQuery.includes("SkipGetNetTcpConnection") && portQuery.includes("NetstatPath"), "port query must expose diagnostic controls for fallback regression coverage");
assert(portQuery.includes("TRUSTED_PROJECT_PIDS="), "port query must identify listeners that match verified PM2 PIDs separately");
assert(!portQuery.includes("Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue"), "primary port lookup failures must not be silently treated as an empty port");
assert(portQuery.includes("Get-CimInstance Win32_Process"), "port query must inspect listener command lines");
assert(portQuery.includes('$ProcessName -ieq "node.exe"'), "port query must only classify node.exe listeners as project or legacy servers");
assert(!portQuery.includes("IndexOf("), "port query must not use substring command ownership checks");
assert(portQuery.includes("CommandLineToArgvW"), "port query must parse Windows command lines into argv");
assert(portQuery.includes("ClassifyOnly") && portQuery.includes("argv[1]"), "port query must expose argv[1] entry-script classification");
const quotedNode = '"C:\\Program Files\\nodejs\\node.exe"';
assert(classifyLauncherProcess("node.exe", `${quotedNode} "${projectServerPath}"`) === "PROJECT", "absolute current-project entry script must be classified as project");
assert(classifyLauncherProcess("node.exe", `${quotedNode} server.cjs`) === "OTHER", "bare server.cjs must remain unowned because its process working directory is unknown");
assert(classifyLauncherProcess("node.exe", `${quotedNode} "${path.join(path.dirname(__dirname), "foreign-project", "server.cjs")}"`) === "OTHER", "another project's absolute server.cjs must not be classified as current project");
assert(classifyLauncherProcess("node.exe", `${quotedNode} other.cjs --config "${projectServerPath}"`) === "OTHER", "a config argument must not be mistaken for the Node entry script");
assert(classifyLauncherProcess("node.exe", `${quotedNode} myserver.cjs`) === "OTHER", "myserver.cjs must not be classified as legacy");
assert(classifyLauncherProcess("python.exe", `${quotedNode} "${projectServerPath}"`) === "OTHER", "non-Node listeners must be classified as other");
assert(pm2Owner, "launcher-pm2-owner.ps1 is missing");
assert(pm2Owner.includes("jlist") && pm2Owner.includes("ConvertFrom-Json"), "PM2 owner helper must read PM2 jlist JSON");
assert(pm2Owner.includes("$Pm2Cmd") && pm2Owner.includes("$Pm2Js") && pm2Owner.includes("$NodeExe"), "PM2 owner helper must support command and JS PM2 entries");
assert(pm2Owner.includes("pm_cwd") && pm2Owner.includes("pm_exec_path"), "PM2 owner helper must verify cwd and exec path");
assert(pm2Owner.includes("Normalize-PathValue") && pm2Owner.includes("-ine"), "PM2 owner helper must normalize paths before case-insensitive comparison");
assert(pm2Owner.includes("PM2_OWNER=current") && pm2Owner.includes("PM2_OWNER=none") && pm2Owner.includes("PM2_OWNER=conflict"), "PM2 owner helper must classify ownership");
assert(pm2Owner.includes("PM2_PIDS="), "PM2 owner helper must return exact PIDs for verified project apps");
const missingOwnerArgs = spawnSync("powershell", [
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy", "Bypass",
  "-File", "launcher-pm2-owner.ps1"
], { encoding: "utf8" });
assert(missingOwnerArgs.status === 0, "PM2 owner helper must handle missing internal arguments without an interactive parameter prompt");
assert(missingOwnerArgs.stdout.includes("PM2_ERROR=") && missingOwnerArgs.stdout.includes("PM2_OWNER=conflict"), "PM2 owner helper must report a machine-readable missing-argument error");
const pm2FixturePath = path.join(require("os").tmpdir(), `launcher-pm2-owner-${process.pid}.json`);
try {
  fs.writeFileSync(pm2FixturePath, JSON.stringify([{
    name: "unrelated-service",
    pid: 12345,
    username: "lower-case-unrelated",
    USERNAME: "upper-case-unrelated",
    pm2_env: {
      pm_cwd: path.join(path.dirname(__dirname), "unrelated-service"),
      pm_exec_path: path.join(path.dirname(__dirname), "unrelated-service", "server.cjs")
    }
  }, {
    name: "api-plus-webtools",
    pid: 43210,
    username: "lower-case-key",
    USERNAME: "upper-case-key",
    pm2_env: {
      pm_cwd: __dirname,
      pm_exec_path: projectServerPath,
      username: "lower-case-env-key",
      USERNAME: "upper-case-env-key"
    }
  }]), "utf8");
  const fixtureOwner = execFileSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "launcher-pm2-owner.ps1",
    "-NodeExe", process.execPath,
    "-JsonFixturePath", pm2FixturePath,
    "-ProjectRoot", __dirname,
    "-ProjectServerPath", projectServerPath
  ], { encoding: "utf8" });
  assert(fixtureOwner.includes("PM2_OWNER=current"), "PM2 ownership parsing must tolerate case-distinct environment keys");
  assert(fixtureOwner.includes("PM2_PIDS=43210"), "PM2 ownership parsing must preserve the verified PID");
} finally {
  fs.rmSync(pm2FixturePath, { force: true });
}
assert(start.includes("launcher-pm2-owner.ps1") && stop.includes("launcher-pm2-owner.ps1"), "launchers must use the PM2 ownership helper");
assert(start.includes("PM2_OWNER") && start.includes("PM2_CONFLICT"), "start launcher must reject foreign PM2 ownership");
assert(start.indexOf("PM2_CONFLICT") < start.indexOf("startOrReload ecosystem.config.cjs"), "PM2 ownership conflict must be checked before reload");
assert(start.indexOf('if /I "%PM2_OWNER%"=="current"') < start.indexOf("startOrReload ecosystem.config.cjs"), "start must verify current PM2 ownership before reload");
const pm2OwnerQueryIndex = start.indexOf("call :QUERY_PM2_OWNER");
const preflightListenerQueryIndex = start.indexOf("call :QUERY_LISTENER", pm2OwnerQueryIndex);
const trustedPm2RouteIndex = start.indexOf('if defined TRUSTED_PROJECT_PIDS if /I "%PM2_OWNER%"=="current" goto START_PM2');
const fallbackReplacementIndex = start.indexOf("if defined PROJECT_PIDS (");
const currentPm2RouteIndex = start.indexOf('if /I "%PM2_OWNER%"=="current" goto START_PM2', fallbackReplacementIndex);
const pm2ReloadIndex = start.indexOf("startOrReload ecosystem.config.cjs");
const postReloadListenerQueryIndex = start.indexOf("call :QUERY_LISTENER", pm2ReloadIndex);
const openPageLabelIndex = start.indexOf(":OPEN_PAGE");
assert(preflightListenerQueryIndex > pm2OwnerQueryIndex && preflightListenerQueryIndex < pm2ReloadIndex, "PM2 startup must inspect the requested port before reload");
assert(currentPm2RouteIndex > preflightListenerQueryIndex, "an owned PM2 app must pass requested-port inspection before startup");
assert(trustedPm2RouteIndex > preflightListenerQueryIndex && trustedPm2RouteIndex < fallbackReplacementIndex, "an already-listening owned PM2 app must bypass fallback replacement");
assert(currentPm2RouteIndex > fallbackReplacementIndex, "a stopped owned PM2 registration must replace an active project fallback before reload");
assert(postReloadListenerQueryIndex > pm2ReloadIndex && postReloadListenerQueryIndex < openPageLabelIndex, "PM2 startup must verify its requested-port listener before reporting success");
const postReloadVerification = start.slice(postReloadListenerQueryIndex, openPageLabelIndex);
assert(postReloadVerification.includes("if defined TRUSTED_PROJECT_PIDS goto OPEN_PAGE"), "PM2 startup must require its verified PID to own the requested listener");
assert(!postReloadVerification.includes("if defined PROJECT_PIDS goto OPEN_PAGE"), "an unmanaged project fallback must not impersonate successful PM2 startup");
assert(start.includes("QUERY_FAILED") && start.includes("PORT_CHECK_FAILED"), "launcher must stop with a clear error when listener detection cannot be trusted");
assert(start.includes("PM2_PIDS") && start.includes("TrustedProjectPids"), "listener verification must trust only PIDs returned by the exact PM2 ownership check");
assert(start.includes("HAS_OTHER_LISTENER") && start.includes("Port %PORT% is already in use by another program."), "launcher must reject unrelated listener conflicts");
assert(start.includes("PROJECT_PIDS") && start.includes("taskkill /PID %%P /F"), "launcher must replace only the current project fallback before PM2 start");
assert(!portQuery.includes('return "LEGACY"'), "port query must never claim ownership of a relative server.cjs command");
assert(!scripts.includes(personalNodePath), "launchers must not contain a personal user path");
assert(!scripts.toLowerCase().includes(codexRuntimePath), "launchers must not contain Codex runtime paths");

assert(stop.includes("delete api-plus-webtools"), "stop launcher must delete the PM2 app first");
assert(stop.includes("PM2_OWNER") && stop.includes("PM2_CONFLICT"), "stop launcher must reject foreign PM2 ownership");
assert(stop.indexOf("PM2_OWNER") < stop.indexOf("delete api-plus-webtools"), "stop must verify PM2 ownership before delete");
assert(stop.indexOf('if /I "%PM2_OWNER%"=="current"') < stop.indexOf("delete api-plus-webtools"), "stop must only delete after current PM2 ownership");
assert(portQuery.includes("CommandLine") && portQuery.includes("ProjectServerPath"), "exact-port query must verify the listener command line");
assert(stop.includes("%~dp0server.cjs"), "fallback stop must scope server.cjs to this project");
assert(stop.includes("HAS_OTHER_LISTENER") && stop.includes("PROJECT_PIDS") && stop.includes("LEGACY_PIDS"), "stop launcher must separate unrelated, project, and legacy listeners");
assert(stop.indexOf("if defined PROJECT_PIDS") < stop.indexOf("taskkill /PID %%P /F"), "stop launcher must only kill a verified listener");
assert(stop.includes("choice /C YN"), "stop launcher must require confirmation before stopping legacy listeners");
assert(stop.indexOf("call :SHOW_LEGACY_COMMAND_LINES") < stop.indexOf("choice /C YN"), "stop must show legacy command lines before confirmation");
assert(legacyStart.includes("call \"%~dp0Start_API_Tool.bat\""), "legacy launcher must delegate to the formal launcher");

assert(readmeStart.includes("PM2") && readmeStart.includes("Node.js"), "quick-start readme must document PM2 and Node fallback");
assert(readmeStart.includes("4198") && readmeStart.includes("Stop_API_Tool.bat"), "quick-start readme must document port and stopping");
assert(readme.includes("PM2") && readme.includes("Node.js"), "README must document PM2 and Node fallback");
assert(readme.includes("4198") && readme.includes("Stop_API_Tool.bat"), "README must document port and stopping");
assert(packageJson.scripts.test.includes("launcher-contract.test.cjs"), "package test must run launcher contract checks");
assert(readRequired("Make_Portable_Package.bat").includes("launcher-port-query.ps1"), "portable package must include the exact-port helper");
assert(readRequired("Make_Portable_Package.bat").includes("launcher-pm2-owner.ps1"), "portable package must include the PM2 owner helper");

async function runPortProbeChecks() {
  const failClosed = invokePortQuery([
    "-SkipGetNetTcpConnection",
    "-NetstatPath", path.join(__dirname, "missing-netstat.exe")
  ]);
  assert(failClosed.status !== 0, "port query must exit non-zero when no reliable listener probe is available");
  assert(failClosed.stdout.includes("QUERY_FAILED=1"), "failed port query must emit QUERY_FAILED=1");
  assert(failClosed.stdout.includes("HAS_OTHER_LISTENER=1"), "failed port query must fail closed as an occupied/untrusted port");

  const fixture = await startTcpListenerFixture();
  try {
    const fallback = invokePortQuery(["-SkipGetNetTcpConnection"], { port: fixture.port });
    assert(fallback.status === 0, `netstat fallback failed: ${fallback.stderr}`);
    assert(fallback.stdout.includes("HAS_OTHER_LISTENER=1"), "netstat fallback must detect an unrelated exact-port listener");
    assert(!fallback.stdout.includes("TRUSTED_PROJECT_PIDS="), "an unrelated listener must not emit an empty trusted-PID record");

    const trusted = invokePortQuery([
      "-SkipGetNetTcpConnection",
      "-TrustedProjectPids", String(fixture.child.pid)
    ], { port: fixture.port });
    assert(trusted.status === 0, `trusted PID lookup failed: ${trusted.stderr}`);
    assert(trusted.stdout.includes(`PROJECT_PIDS=${fixture.child.pid}`), "a verified PM2 PID must be recognized as a project listener");
    assert(trusted.stdout.includes(`TRUSTED_PROJECT_PIDS=${fixture.child.pid}`), "a verified PM2 PID must remain distinguishable from an unmanaged project listener");
    assert(!trusted.stdout.includes("HAS_OTHER_LISTENER=1"), "a verified PM2 listener must not be reported as foreign");
  } finally {
    fixture.child.kill();
  }
}

runPortProbeChecks()
  .then(() => console.log("launcher contract checks passed"))
  .catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
