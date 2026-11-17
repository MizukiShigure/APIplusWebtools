APIplusWebtools - Windows x64 portable and developer package

USE THE WEB TOOL
For a new Git clone, first run Setup_Workbench.bat to configure Node, the local service, and the Agent Skill.
1. Double-click Start_API_Tool.bat.
2. Open http://127.0.0.1:4198/ if the browser does not open automatically.
3. Enter the administrator-provided gateway in API Base on the local page. It is saved privately for browser and Agent use. Configure your own optional RunningHub key/workflows.
4. Double-click Stop_API_Tool.bat when finished.

DEVELOP THE PROJECT
1. Read AGENTS.md and docs/DEVELOPMENT.md.
2. Run npm test.
3. Run npm start.
4. Build a privacy-clean package with npm run package.

NOTES
- The full Windows x64 package includes runtime/node.exe and its license. No Node/npm installation is needed for normal use.
- Source-only packages require Node.js 20+. The runtime-only bundle does not include npm.
- PM2 is optional; bundled-runtime installs use a hidden Node.js process and write logs under data/logs by default.
- Browser rows/settings use localStorage; history uses IndexedDB plus the selected API_BATCH_DATA_DIR.
- This package starts without the maintainer's cache, prompts, queues, keys, logs, or personal workflow settings.
- Company/provider calls still require network access and a compatible API Base.

LOCAL AGENT API
1. Run skills/api-plus-agent/scripts/run-workbench.ps1 capabilities. The service starts hidden when needed.
2. No open browser or manual local Agent token setup is required for supported headless tasks.
3. Use skills/api-plus-agent/scripts/api-plus-agent-client.mjs; run capabilities before submit.
4. Agent records include source identity, uploads, full input, prompt/options, upstream IDs, and results. Use history/events to inspect and recreate for a requested new draw.

The Agent API is loopback-only. Agent callers can append but cannot delete history. Git clones store server metadata in the sibling APIplusWebtools-data directory; portable ZIP installs use their local data directory.

RECIPIENT SETUP AND BACKUP
- Read docs/GIT_WORKFLOW.md for clone/setup, the "sync project" Agent command, and optional Fork/PR contributions selected by the maintainer.
- Read docs/LOCAL_DEPLOYMENT.md for Chinese setup, troubleshooting, and migration instructions.
- Give docs/AGENT_DEPLOYMENT.md to Codex, Minimax Code, or another local coding Agent for setup assistance.
- Extract the whole ZIP first. Do not run from inside the ZIP. Use a writable folder, preferably on D: if available.
- Manual browser tasks need their page while running; headless Agent tasks do not. Company network access is still required.
- Before upgrading, stop the service and back up the entire data folder. Keep your browser profile and local URL/port unchanged.
- No automatic Windows startup entry is installed; double-click Start_API_Tool.bat again after reboot.
- Full api-plus-agent skill releases embed the clean workbench/runtime ZIP. local-api-workbench is a separate small skill for this workstation's existing installation.
