# Portable Workbench Setup

The full skill ZIP contains `assets/workbench.zip` and `assets/workbench-manifest.json`. The nested archive includes the Windows x64 Node executable and license, source, tests, engineering guides, and the client. It does not recursively include itself or the machine-specific local skill.

Run `scripts/run-workbench.ps1 capabilities` from the skill folder. The wrapper uses an existing `API_PLUS_WORKBENCH_ROOT` if supplied, then an enclosing source checkout, otherwise extracts the embedded archive into `workbench/<version>` inside this skill. It verifies the archive hash before extraction and the runtime hash before invocation. The installation folder must be writable. No administrator access, npm, PM2, browser launch, or local Agent token setup is needed.

For a chosen existing installation, set `API_PLUS_WORKBENCH_ROOT` to its absolute directory. The wrapper does not overwrite another installation or migrate private data. Before upgrading an embedded version, stop owned active work, back up the previous data directory, and copy it to the new installation before use or keep a stable explicit `API_BATCH_DATA_DIR`.

Generation uses the preconfigured company gateway and still needs that network/channel to be available. Optional personal integrations use the recipient's own saved configuration. A capability check proves local startup, not that every remote model currently has capacity.

Expose this folder through the receiving Agent's supported skill discovery directory. The `local-api-workbench` deliverable is intentionally machine-specific and should only be installed on the workstation whose path it names.

The source checkout does not store the large embedded ZIP. Release builders populate `assets` only in the generated skill package. A source-only skill outside a checkout needs `API_PLUS_WORKBENCH_ROOT` or a full skill release.
