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
assert(!scripts.includes(personalNodePath), "launchers must not contain a personal user path");
assert(!scripts.toLowerCase().includes(codexRuntimePath), "launchers must not contain Codex runtime paths");

assert(stop.includes("delete api-plus-webtools"), "stop launcher must delete the PM2 app first");
assert(stop.includes("CommandLine") && stop.includes("server.cjs"), "fallback stop must verify the process command line");
assert(stop.includes("%~dp0server.cjs"), "fallback stop must scope server.cjs to this project");
assert(stop.indexOf("if defined MATCH (") < stop.indexOf("taskkill /PID %%P /F"), "stop launcher must only kill a verified listener");
assert(legacyStart.includes("call \"%~dp0Start_API_Tool.bat\""), "legacy launcher must delegate to the formal launcher");

assert(readmeStart.includes("PM2") && readmeStart.includes("Node.js"), "quick-start readme must document PM2 and Node fallback");
assert(readmeStart.includes("4198") && readmeStart.includes("Stop_API_Tool.bat"), "quick-start readme must document port and stopping");
assert(readme.includes("PM2") && readme.includes("Node.js"), "README must document PM2 and Node fallback");
assert(readme.includes("4198") && readme.includes("Stop_API_Tool.bat"), "README must document port and stopping");
assert(packageJson.scripts.test.includes("launcher-contract.test.cjs"), "package test must run launcher contract checks");

console.log("launcher contract checks passed");
