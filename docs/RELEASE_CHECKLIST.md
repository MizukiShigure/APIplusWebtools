# Release Checklist

## 1. Prepare

- Confirm the intended branch and review `git status`.
- Preserve unrelated working-tree changes.
- Decide the release identifier, for example `vYYYY.MM.DD-topic.N`.
- Update `VERSION`.
- Update the version in `package.json`.
- Add a dated section to `CHANGELOG.md`.
- Update cache-busting query strings in `index.html` when browser assets changed.
- Update any version-specific assertions in `portable-package.test.cjs` and launcher tests.

## 2. Verify Source

Run:

```powershell
npm test
```

Expected result: every contract test prints its pass message and the process exits with code 0.

For a provider change, also perform one minimal live request through the intended gateway and record what was verified. Do not treat public provider docs as proof that the company gateway route exists.

## 3. Build The Distribution

Run:

```powershell
npm run package
```

The output is written under `dist/` unless an explicit ZIP path is supplied to `scripts/build-portable.ps1`.

The package contains both:

- the Windows launchers (Node itself is included only when `-NodeRuntimePath` and `-NodeLicensePath` are supplied);
- source, tests, `AGENTS.md`, `CONTRIBUTING.md`, and engineering docs for continued development.

## 4. Inspect The ZIP

Verify:

- `Start_API_Tool.bat` and `Stop_API_Tool.bat` are present;
- `AGENTS.md` and all public `docs/*.md` guides are present;
- all tests referenced by `package.json` are present;
- `data` contains only `.keep`;
- source-only `runtime` contains only `.keep`; full builds contain `.keep`, `node.exe`, and `LICENSE`, with matching SHA-256 in `PORTABLE_BUILD.json`;
- API Base contains the approved company gateway; credentials and personal workflow IDs are blank;
- no history, prompts, queue state, keys, logs, personal workflow IDs, or machine paths appear;
- the package can rebuild an equivalent package using its own builder.

The automated portable-package test covers these checks, but a quick manual review is still worthwhile before external distribution.

## 5. Smoke Test A Clean Copy

1. Extract the ZIP to a new directory.
2. Run `Start_API_Tool.bat`.
3. Confirm the page opens on the displayed local URL.
4. Confirm API Base uses the approved company gateway and user data starts empty on a fresh browser/profile and data directory.
5. Add a temporary row and refresh to verify row persistence.
6. Open the history page and confirm it does not contain the maintainer's records.
7. Stop with `Stop_API_Tool.bat`.
8. Run `npm test` from the extracted package to verify the development handoff.

## 6. Commit, Tag, And Publish

### Skill releases

Build the two skill variants with an explicit Windows runtime and license:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-skills.ps1 -NodeRuntimePath runtime/node.exe -NodeLicensePath runtime/LICENSE -IncludeLocalSkill -OutputDirectory dist/skills-release
```

The output directory must not contain existing release targets. `api-plus-agent` includes `assets/workbench.zip` with Node/license and a SHA-256 manifest. The nested workbench includes public source/docs/tests but no generated nested skill ZIP or machine-specific local skill. `local-api-workbench` contains only its skill, metadata, and fixed-path wrapper; it is a separate local-machine deliverable. `SKILL_RELEASE.json` records archive hashes. An extracted portable source package can rebuild its full portable skill without `-IncludeLocalSkill`.

Run `node skill-release.test.cjs`; set `PORTABLE_TEST_NODE` and `PORTABLE_TEST_LICENSE` to enable full runtime packaging/extraction. Verify embedded archive hash, runtime hash/license, privacy exclusions, wrapper argument forwarding, and capability startup without a browser/token in a clean isolated data directory. Separately verify real upload/task/history attribution and provider connectivity; a packaged capability smoke test is not proof of live generation.

After authorized shared installation, compare installed file hashes and resolve junction targets. Preserve old skill copies until the replacements are verified. Report effective paths and whether another Agent's active session has actually reloaded the instructions.

Create a focused commit that includes source, tests, docs, and version files. Then tag the exact verified commit:

```powershell
git tag <release-tag>
git push origin main
git push origin <release-tag>
```

Attach the ZIP to the matching GitHub release when distributing snapshots. Users who need update/rollback support should prefer `git clone`; ZIP users receive a fixed snapshot without `.git` history.

## Rollback

Git installations can use `Restore_Version.bat` or check out a stable tag. ZIP installations should retain the previous verified ZIP and extract it to a separate directory rather than mixing versions in place.
