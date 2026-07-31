# Row Completion Time Design

## Goal

Show the completion time for a generated row after its entire batch finishes. The displayed time represents when the final child job in that row settled and is shown only to minute precision.

## Data Model

- Add a persisted numeric `completedAt` timestamp to every generation-row type.
- Preserve `completedAt` when saved rows are normalized after a refresh.
- Existing rows without the field use `0` and continue to work unchanged.

## State Rules

- Set `completedAt` when the shared row status resolver transitions a row to `done`.
- Use the final child job's `lastActivityAt` value, falling back to the current time.
- Keep the first terminal timestamp if a completed row is rendered or persisted again.
- Clear `completedAt` when a row is queued for a new submission.
- Clear `completedAt` when submitted inputs are edited or removed and the row becomes `dirty`.
- Do not show a completion time for pending, queued, running, partial, failed, canceled, or dirty rows.

## Display

- Render a secondary line directly beneath the completed status pill.
- Format it in local time as `完成于 MM/DD HH:mm`.
- Month, day, hour, and minute are zero-padded.

## Scope

Apply the same behavior to image generation, image-to-video, motion imitation, digital avatar, multimodal video, and Vidu reference-video rows, including rows whose remote polling resumes after a page refresh.

## Verification

- Contract tests verify timestamp formatting, terminal-state assignment, requeue clearing, dirty-state clearing, and status-cell rendering.
- Run the full project test suite and rebuild the portable package.
