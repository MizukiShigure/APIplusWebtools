# Independent Avatar Production Areas

Corrected by the user on 2026-09-21: speech, avatar and subtitles are three large subpage tabs, not vertically stacked sections. In the follow-up layout refinement, album, voices, workflows and settings move into the title bar as compact auxiliary tabs above production navigation. On narrow screens they wrap below the title, still inside the header. The earlier stacked interpretation was incorrect. Keep the current 4198 service, shared registry, credentials and existing data.

## Interaction

- Speech: text and output player on the left; voice/model/language/speed/volume/pitch and advanced controls on the right. Generate speech independently. Existing audio and audio adjustment remain available in this area, with their own action.
- Avatar: audio selection/upload/URL and album image selection/preview on the left; workflow, performance prompt and supported parameters on the right. Generate only the avatar. Output video remains visible under its section.
- Subtitles: audio/video upload/URL, source preview and original transcript on the left; subtitle preview/editor and download on the right. Generate only subtitles, without requiring a voice or image.
- Each area has its own submission state, input draft and result list. Running one does not disable the others. Edits do not erase results. Previous results remain selectable; polling must not replace focused inputs or restart media players unnecessarily.
- Audio output actions explicitly fill avatar or subtitle inputs. Video output can fill subtitle input. Transfer does not submit, clear unrelated fields or mutate the source result. Changes to a populated target require confirmation before replacing its media input. Original text travels with audio when supplied to subtitles.
- Exactly one production subpage is visible at a time; each retains responsive left/right columns on desktop and one column on narrow screens. The three primary tabs are larger than the four auxiliary tabs, and the two rows remain separate. Library pages hide production content without destroying its forms.
- Manual handoff opens the target production tab without submission; selecting an album image returns to the avatar tab. Tab switching retains drafts, selected outputs and subtitle edits, pauses hidden media, and does not affect server execution. Keyboard navigation stays within each tab row.

## Backend Contract

POST `/api/control/v1/avatar-workflow/jobs` and the matching Agent route keep the existing envelope. `input.operation` is one of `speech`, `adjustAudio`, `avatar`, `subtitle`; omission retains the legacy pipeline for stored jobs and existing clients.

Speech consumes text/voiceId/options.speech. Adjustment consumes audioUrl/options.adjustAudio. Avatar consumes audioUrl/imageId/workflowId/prompt/options.avatar. Subtitle consumes mediaUrl/text/options.subtitle. Job outputs remain `steps.speech`, `steps.adjustAudio`, `steps.avatar`, `steps.subtitle`; a supplied input is not published as a new generation.

Add authenticated POST `/media` for audio/video multipart uploads, preserving `/audio`. Local media URLs must resolve only within the shared media directory. Subtitle processing may temporarily read its selected input video, but does not automatically archive generated videos. Source metadata and operation remain in shared generation history.

## Safety And Compatibility

Preserve idempotent submission, task-ID recovery, secret redaction, append-only Agent history, source labels and existing registry versions. Test with isolated data and mocked paid APIs. Existing 4208 service and private data remain untouched. No automatic paid calls during verification.
