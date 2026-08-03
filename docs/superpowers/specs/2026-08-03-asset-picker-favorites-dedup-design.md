# Asset Picker Favorites And Exact Upload Deduplication

## Goal

Improve the historical upload asset picker without changing how task rows consume assets:

- Let users favorite upload assets and optionally show only favorites.
- Keep the picker title, close action, media-type tabs, and favorite filter fixed while the asset grid scrolls.
- Prevent exact duplicate local files from being uploaded or stored more than once.

## Scope

This change applies to the shared `assetDialog` used by image, image-to-video, motion, multimodal video, avatar, music, voice, subject, and batch-image workflows.

It does not add filename or URL search. It does not download historical remote files to retroactively hash them. It does not alter generation-result favorites.

## Favorites

Upload favorites are stored independently from upload-history records. A new local-storage set holds stable favorite keys:

- Prefer the asset content hash when available.
- Fall back to the normalized asset URL for legacy records.

The independent set avoids mutating append-only control-history records and survives picker rerenders and page reloads. When exact duplicate records are merged, a favorite attached to either stable key is retained for the canonical item.

The picker displays a star control on every asset card. Activating the star must stop event propagation so it never selects or closes the picker. A single `Favorites only` toggle appears beside the existing media-type tabs. The filter applies after media type and persists for the current browser.

## Picker Layout

The dialog panel uses two vertical regions:

1. A fixed toolbar containing the title, close button, media-type tabs, and favorites-only toggle.
2. A scrollable asset-grid region.

The dialog keeps its current viewport constraints. Only the grid scroll position changes; selecting a favorite or switching the favorites-only filter must not close the dialog.

## Exact Duplicate Detection

Every newly selected local file receives a SHA-256 digest computed with `crypto.subtle.digest` before network upload. The persisted asset stores:

- `contentHash`
- original filename
- byte size
- media type
- image width and height when applicable
- media duration when applicable

The exact duplicate identity combines normalized filename, byte size, media metadata, type, and SHA-256 content hash. SHA-256 is mandatory for cross-URL duplicate matching; metadata alone is never sufficient to remove two different files.

Before uploading a file, the shared upload path checks the current upload history for this identity:

- If a match exists, reuse the canonical asset and URL, skip the network upload, and continue the caller's normal row-assignment behavior.
- If no match exists, upload normally and persist the fingerprint fields on the resulting asset.

`addUploadHistory` and history pruning also enforce the same identity so imports, recovery, and concurrent paths cannot reintroduce hashed duplicates. Legacy records without a hash continue to deduplicate only by identical normalized URL. No remote media is fetched solely for migration.

When duplicates are found, the existing record is canonical. Its ID, URL, origin metadata, and favorite state are retained. Reusing a duplicate file may attach that existing asset to the active row but does not create a new history record.

## Compatibility And Failure Handling

- Browsers without `crypto.subtle` fall back to existing URL-only deduplication and still upload the file; they must not perform unsafe metadata-only removal.
- A digest failure is non-fatal: upload continues without a content hash.
- Existing upload records remain readable without migration.
- Media-type retention remains 1,000 records after exact deduplication.
- Existing task-row locking and accepted-file-type rules remain unchanged.

## Testing

Add focused contract/unit coverage before implementation:

- Stable favorite keys prefer content hash and fall back to URL.
- Favorite toggling and favorites-only filtering are independent of card selection.
- Exact fingerprints distinguish same-name/same-size files with different hashes.
- Exact fingerprints merge matching files even when their uploaded URLs differ.
- Legacy records deduplicate only when URLs match.
- A duplicate local upload reuses the existing asset and does not call the upload transport.
- Picker markup has a fixed toolbar and independently scrollable grid.

Run the focused tests first, then the full `npm test` suite and a browser-level visual check of the dialog at desktop and narrow viewport sizes.
