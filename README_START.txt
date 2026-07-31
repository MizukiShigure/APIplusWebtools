APIplusWebtools - direct-use and developer package

USE THE WEB TOOL
1. Double-click Start_API_Tool.bat.
2. Open http://127.0.0.1:4198/?v=release-20260801-agent-api if the browser does not open automatically.
3. Enter your own API Base and runtime configuration in the page.
4. Double-click Stop_API_Tool.bat when finished.

DEVELOP THE PROJECT
1. Read AGENTS.md and docs/DEVELOPMENT.md.
2. Run npm test.
3. Run npm start.
4. Build a privacy-clean package with npm run package.

NOTES
- Node.js 20+ is required. You may place node.exe in runtime if Node is not installed globally.
- PM2 is optional; the launcher falls back to a normal minimized Node.js process.
- Browser rows/settings use localStorage; history uses IndexedDB plus the selected API_BATCH_DATA_DIR.
- This package starts without the maintainer's cache, prompts, queues, keys, logs, or personal workflow settings.
- Company/provider calls still require network access and a compatible API Base.

LOCAL AGENT API
1. Keep one http://127.0.0.1:4198/ browser tab open as the execution worker.
2. Open Agent API Settings in the sidebar and copy the local token into API_PLUS_AGENT_TOKEN.
3. Use skills/api-plus-agent/scripts/api-plus-agent-client.mjs; run capabilities before submit.
4. Agent records appear in the same history cache with their source label.

The Agent API is loopback-only. Agent callers can append but cannot delete history. Git clones store server metadata in the sibling APIplusWebtools-data directory; portable ZIP installs use their local data directory.
