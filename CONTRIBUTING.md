# Contributing

See [installation, synchronization, and selective contributions](docs/GIT_WORKFLOW.md) for the maintainer/Fork/PR workflow. Consumers use `sync`; it never pushes local changes. Contributors preserve changes on a topic branch, run verification, and open a PR. The maintainer chooses what to merge.

Thank you for improving APIplusWebtools. This project favors small, testable changes that preserve local user data and existing provider behavior.

## Set Up

Requirements:

- Windows 10/11 for the supported launcher flow.
- Node.js 20 or newer.
- Git for source updates and version history.

Clone the repository, then run:

```powershell
npm test
npm start
```

No package installation is currently required because the runtime and tests use browser APIs and Node built-ins.

## Branch And Change Scope

- Create a focused branch for each feature or fix.
- Keep provider payload changes separate from unrelated visual refactors.
- Do not commit generated packages, `data/`, logs, browser exports, local recovery files, or credentials.
- Preserve unrelated local edits.

## Development Rules

- Add a failing contract test before fixing a bug or extending a workflow.
- Keep provider rules close to the relevant model configuration; prefer `model-contracts.js` for pure rules.
- Keep storage migrations backward compatible.
- Persist async task IDs before polling and resume them after refresh.
- Treat cancellation as a capability: call a remote cancel endpoint only when the model declares one; otherwise cancel locally.
- Use UTF-8 without BOM for source and documentation.

## Verification

Run the complete suite:

```powershell
npm test
```

Build and inspect the clean distribution:

```powershell
npm run package
```

The package test checks the allowlist, rebuilds the package from itself, and scans the contents for private paths, gateways, tokens, and concrete personal workflow settings.

## Pull Request Checklist

- The user workflow and expected result are described.
- Focused tests cover the behavior.
- `npm test` passes.
- New storage fields have normalization or migration handling.
- Provider errors remain visible enough to diagnose.
- No private cache, prompt, URL, key, or local path is included.
- User-facing changes are added to `CHANGELOG.md` when preparing a release.
