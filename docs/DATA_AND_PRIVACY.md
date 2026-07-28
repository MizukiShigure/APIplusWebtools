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

If the application directory is not writable, it falls back to:

```text
%APPDATA%\Internal_API_Batch\history.json
```

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
- empty `data/.keep` and `runtime/.keep` placeholders.

It excludes:

- current browser storage;
- `data/history.json`;
- prompts, queues, generated records, and subject libraries;
- API keys and personal workflow configuration;
- logs, recovery exports, Git metadata, and generated archives.

The builder also rewrites the packaged API Base default to empty. `portable-package.test.cjs` scans the expanded package and a package rebuilt from that package to enforce these guarantees.

## Operator Guidance

- Treat the machine and browser profile as trusted local storage.
- Do not expose the local server to a LAN without adding authentication and reviewing all routes.
- Do not send a working project folder directly; send the generated ZIP or a clean Git clone.
- Review the ZIP whenever new files are added to the package allowlist.
