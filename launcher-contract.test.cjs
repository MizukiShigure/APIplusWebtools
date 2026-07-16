const fs = require("fs");

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

assert(Array.isArray(ecosystem.apps) && ecosystem.apps.length === 1, "PM2 config must define one app");
const app = ecosystem.apps[0];
assert(app.name === "api-plus-webtools", "PM2 app name must be api-plus-webtools");
assert(app.script === "server.cjs", "PM2 must run server.cjs");
assert(app.cwd === __dirname, "PM2 cwd must be the project directory");
assert(app.env.HOST === "127.0.0.1", "PM2 must bind to 127.0.0.1");
assert(app.env.PORT === 4198 || ecosystemSource.includes("process.env.PORT || 4198"), "PM2 must default PORT to 4198");
assert(app.autorestart === true, "PM2 must autorestart the app");
assert(app.watch === false, "PM2 watch mode must be disabled");

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
assert(start.includes("start \"Internal API Batch Server\" /min"), "launcher must retain minimized Node fallback");
assert(!start.includes('findstr ":%PORT%"') && !stop.includes('findstr ":%PORT%"'), "launchers must not prefix-match a port with findstr");
assert(portQuery, "launcher-port-query.ps1 is missing");
assert(start.includes("launcher-port-query.ps1") && stop.includes("launcher-port-query.ps1"), "launchers must use the exact-port query helper");
assert(portQuery.includes("Get-NetTCPConnection -State Listen -LocalPort"), "port query must use exact listening TCP port lookup");
assert(portQuery.includes("Get-CimInstance Win32_Process"), "port query must inspect listener command lines");
assert(portQuery.includes('$process.Name -ieq "node.exe"'), "port query must only classify node.exe listeners as project or legacy servers");
assert(!portQuery.includes("IndexOf("), "port query must not use substring command ownership checks");
assert(portQuery.includes("Test-ExactCommandLineToken") && portQuery.includes("ProjectServerPath"), "port query must match the project script as an exact command-line token");
assert(portQuery.includes("(?<!\\S)") && portQuery.includes('Token "server.cjs"'), "port query must enforce exact token boundaries for legacy scripts");
assert(portQuery.includes("ShowLegacyCommandLines") && portQuery.includes("Legacy PID"), "port query must expose legacy command lines for confirmation");
assert(pm2Owner, "launcher-pm2-owner.ps1 is missing");
assert(pm2Owner.includes("jlist") && pm2Owner.includes("ConvertFrom-Json"), "PM2 owner helper must read PM2 jlist JSON");
assert(pm2Owner.includes("$Pm2Cmd") && pm2Owner.includes("$Pm2Js") && pm2Owner.includes("$NodeExe"), "PM2 owner helper must support command and JS PM2 entries");
assert(pm2Owner.includes("pm_cwd") && pm2Owner.includes("pm_exec_path"), "PM2 owner helper must verify cwd and exec path");
assert(pm2Owner.includes("Normalize-PathValue") && pm2Owner.includes("-ine"), "PM2 owner helper must normalize paths before case-insensitive comparison");
assert(pm2Owner.includes("PM2_OWNER=current") && pm2Owner.includes("PM2_OWNER=none") && pm2Owner.includes("PM2_OWNER=conflict"), "PM2 owner helper must classify ownership");
assert(start.includes("launcher-pm2-owner.ps1") && stop.includes("launcher-pm2-owner.ps1"), "launchers must use the PM2 ownership helper");
assert(start.includes("PM2_OWNER") && start.includes("PM2_CONFLICT"), "start launcher must reject foreign PM2 ownership");
assert(start.indexOf("PM2_CONFLICT") < start.indexOf("startOrReload ecosystem.config.cjs"), "PM2 ownership conflict must be checked before reload");
assert(start.indexOf('if /I "%PM2_OWNER%"=="current"') < start.indexOf("startOrReload ecosystem.config.cjs"), "start must verify current PM2 ownership before reload");
assert(start.includes("HAS_OTHER_LISTENER") && start.includes("Port %PORT% is already in use by another program."), "launcher must reject unrelated listener conflicts");
assert(start.includes("PROJECT_PIDS") && start.includes("taskkill /PID %%P /F"), "launcher must replace only the current project fallback before PM2 start");
assert(portQuery.includes("LEGACY_PIDS") && portQuery.includes('Token "server.cjs"'), "port query must classify bare legacy server commands separately");
assert(start.includes("LEGACY_PIDS") && start.includes("choice /C YN"), "start launcher must require confirmation before migrating legacy listeners");
assert(start.indexOf("call :SHOW_LEGACY_COMMAND_LINES") < start.indexOf("choice /C YN"), "start must show legacy command lines before confirmation");
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

console.log("launcher contract checks passed");
