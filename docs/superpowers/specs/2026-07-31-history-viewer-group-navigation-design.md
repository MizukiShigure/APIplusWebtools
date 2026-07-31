# History Viewer Group Navigation Design

## Goal

Make full-screen image and video navigation follow the generation-cache grouping that users see in the grid.

The viewer must expose two independent navigation levels:

- Previous/next item moves only inside the current input group.
- Previous/next group follows the current generation-cache group order.

This change applies only to generation-cache previews. Result previews opened directly from task rows keep their existing navigation behavior.

## User-Facing Behavior

The viewer header contains these controls:

1. Previous group
2. Previous item
3. Current filename
4. Next item
5. Next group
6. Close

Rules:

- Previous item and next item never cross a group boundary.
- At the first or last item in a group, the corresponding item button is disabled.
- Previous group and next group follow the exact order of the filtered generation groups shown by the cache pool.
- Group navigation uses the active media type, model filter, size filter, favorites filter, and prompt search.
- Group navigation can cross cache pagination boundaries without changing the page currently displayed behind the viewer.
- Entering another group opens the first result shown for that group in the cache grid.
- Arrow Left and Arrow Right navigate items within the current group only.
- Image and video previews use the same navigation rules.

## Group and Item Ordering

`filteredGenerationInputGroups()` is the source of truth for group order. The viewer must not rebuild a separate time-sorted flat list.

For each group:

- Keep only results matching the current media type and having a usable URL.
- Preserve the same item order used by the expanded group card.
- The destination of previous/next group navigation is item index `0`.

The viewer resolves its cursor as:

```text
groupIndex + itemIndex
```

The currently open result is located by its generation result key first, then by URL as a compatibility fallback.

## Data Flow

1. A generation-cache card opens the viewer with its result token and source `history`.
2. The viewer builds a grouped navigation snapshot from the active filters.
3. It locates the current group and item.
4. Item controls move within `group.items`.
5. Group controls move within the ordered group list and open the destination group's first item.
6. Every render recalculates disabled states from the current cursor.

Task-row result previews continue using the existing result-source list and do not receive group controls.

## Deletion Behavior

After deleting the currently previewed generation result:

1. Prefer the next item in the same group.
2. If none exists, use the previous item in the same group.
3. If the group becomes empty, open the first item of the next group.
4. If no next group exists, open the first item of the previous group.
5. Close the viewer only when no eligible result remains.

The navigation snapshot must be rebuilt after deletion so removed items and emptied groups cannot remain addressable.

## Boundaries and Compatibility

- Upload-cache previews retain their existing flat navigation behavior because uploads have no generation input groups.
- If a legacy or URL-only entry cannot be assigned to a generation group, fall back to the existing flat history navigation.
- Filters changed while the viewer is open are reflected the next time navigation is resolved.
- A missing or deleted token must fail safely without changing cached records.

## Testing

Add a focused regression test that verifies:

- Group order comes from `filteredGenerationInputGroups()`.
- Item navigation stays inside the current group.
- Group navigation opens item zero in the adjacent group.
- Boundary controls are disabled correctly.
- Active filters determine available groups.
- Deletion prefers same-group neighbors and then adjacent groups.
- Upload-cache and task-row result navigation remain compatible.
- Viewer markup exposes all four navigation controls.

Run the focused regression test, the complete test suite, portable packaging, and a served-page cache-version check before completion.
