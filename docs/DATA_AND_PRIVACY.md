# Data Storage And Privacy

## What Is Stored

The tool stores configuration and structured records locally so rows and history survive refreshes.

### Browser localStorage

Used for:

- API Base and concurrency;
- active page and history filters;
- task rows and their queue/recovery metadata;
- model-specific endpoint overrides;
- RunningHub workflow settings;
- subject/voice forms and libraries;
- favorites and other small UI settings.

localStorage is origin-scoped and not encrypted. Anyone with access to the same operating-system/browser profile can inspect it.

### Browser IndexedDB

Database: `api_console_history_db_v1`

Store: `history`

Records:

- `uploadHistory`
- `generationHistory`

IndexedDB is the primary history store because history can become larger than localStorage safely handles.

### Disk backup

The local server mirrors history to:

```text
data/history.json
```

Writes use the configured shared data directory. A primary write failure is reported to the caller; it does not write a fallback copy to AppData. Existing `%APPDATA%\Internal_API_Batch\history.json` files remain read-only recovery sources and are not deleted.

Writes are atomic: a temporary file is written and then renamed.

## What Is Not Stored

The history backup does not copy remote image, video, or audio binary files. It stores URLs, prompt text, model/version/parameter metadata, task IDs, timestamps, and reference metadata.

Provider responses or remote URLs may expire independently of this tool. Download important output files separately.

## Retention

Upload history and generation history are each capped at 1000 records per media type:

- image;
- video;
- audio;
- other.

The history interface shows 50 groups per page. Generation records with identical input signatures may be grouped so one input card opens all of its results.

Favorites are presentation metadata and do not bypass the current retention cap.

## Recovery And Merge Rules

At startup the browser merges:

1. IndexedDB history;
2. recognized legacy localStorage history;
3. the disk backup returned by `/api/local/history`.

Records are deduplicated and ordered by timestamp. The startup path does not write an empty history snapshot when no non-empty source exists. This protects an existing disk backup from a newly empty browser profile.

A different browser, hostname, or port has different browser storage. The disk backup can repopulate history when the same local project directory/server is used.

## Clearing Data

- Browser site-data clearing removes localStorage and IndexedDB for that origin.
- Deleting `data/history.json` removes the primary disk backup.
- The AppData fallback may still exist if the project directory was previously read-only.
- Deleting a history item in the UI updates browser history and schedules a new disk snapshot.
- Clearing all three locations is required for a complete local reset.

Stop the local service before manually editing or replacing the disk backup.

## Distribution Privacy

The distribution builder is allowlist-based. A generated ZIP contains:

- source files and launchers;
- engineering documentation and tests;
- empty `data/.keep` and `runtime/.keep` placeholders; full Windows builds additionally include only the explicitly supplied runtime executable, license, and build manifest.

It excludes:

- current browser storage;
- `data/history.json`;
- prompts, queues, generated records, and subject libraries;
- API keys and personal workflow configuration;
- logs, recovery exports, Git metadata, and generated archives.

The builder preserves the approved company API Base and neutral node templates. It does not read browser storage or local configuration. `portable-package.test.cjs` scans the expanded source package and a rebuilt package; `portable-runtime.test.cjs` can additionally verify the explicit runtime and license.

## Operator Guidance

- Treat the machine and browser profile as trusted local storage.
- Do not expose the local server to a LAN without adding authentication and reviewing all routes.
- Do not send a working project folder directly; send the generated ZIP or a clean Git clone.
- Review the ZIP whenever new files are added to the package allowlist.

## Agent Metadata And Backup

The launcher chooses one authoritative server data directory:

- Git clone/worktree: sibling `APIplusWebtools-data`, outside the source tree.
- Portable ZIP: the package's `data` directory.
- Explicit override: `API_BATCH_DATA_DIR`.

It contains `history.json`, append-only task/history journals and snapshots, optional compatibility Agent authentication, and temporary staged inputs. It does not copy completed remote image/video/audio bodies. Temporary staging files are consumed and removed by the executor. Upload records include original filename, local source path, SHA-256, media metadata, and Agent identity; task records include full prompt/options/input, provider IDs, progress/errors, and results so another draw can be traced to its inputs.

Stop the service before backup or migration, then copy the entire selected data directory as one unit. Restore it beside the matching project install before startup. Keep this directory private because task prompts, source labels, remote URLs, and the Agent bearer token are sensitive.

Browser `localStorage` and IndexedDB remain scoped by browser profile, hostname, and port. The disk history bridge allows history metadata to merge back after refresh, but clearing a browser profile can still remove unsynced rows/settings. Do not replace a populated disk file with an empty browser export.

Agent callers are append-only and cannot remove history. Only explicit manual browser actions can delete records. The local CLI does not need token configuration. Compatibility token rotation does not erase history. Tokenless local access does not permit LAN/public binding.

Full skill releases embed the clean allowlisted workbench ZIP with runtime and license; the archive never contains its own generated skill ZIP. The separate lightweight local skill contains its intentional fixed installation path, but no application, runtime, credentials, uploads, or history. It is excluded from the portable workbench archive so another machine receives no maintainer paths.
