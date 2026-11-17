# Model and Prompt Library Updates

## November 2026 image models

Verified on 2026-11-15 against the [company frontend](https://gateway.example/) and [OpenAPI](https://gateway.example/openapi.json). The image page and headless CLI use the same contracts.

| Local model | Versions | Create / Query | Options |
| --- | --- | --- | --- |
| `gpt26` | `gpt-image-2.6-flare`, `gpt-image-2.6-sunburst` | `/gen_img_4o` / `/gen_img_4o_query` | PNG, SVG, GIF; low/medium/high/xhigh/max quality; auto/transparent/opaque background |
| `minimaxH3Image` | `MiniMax-H3-Image` | `/minimax_image` / `/minimax_image_query` | 1K/2K/4K; ten aspect ratios; up to eight reference images |

GPT 2.6 defaults to Flare, PNG, 2K square, high render quality. PNG uses the existing GPT 2.5 dimension table and up to four image references. SVG accepts no references and omits `image_size`. GIF also omits `image_size`; CLI options `frameSize`, `frameCount`, and `frameDurationMs` map to `frame_size`, `frame_count`, and `frame_duration_ms`. Frame sizes: 288x288, 384x384, 512x288, 288x512, 512x512, 768x768, 1024x1024; 2–16 frames; 20–2000ms per frame in steps of 10. Defaults: 288x288, 9 frames, 200ms. Format settings survive batch creation, refresh, history replay and row copy.

H3 Image defaults to 2K, 1:1. Its payload uses `prompt`, `refer_imgs`, `resolution`, `aspect_ratio`, `model_name`. It has no video duration, audio flag or H3-video resolution enum. The ten aspect ratios are 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9, 3:1 and 1:3.

New model support is verified with local payload/integration tests and isolated browser checks. Listing a model or receiving a 405 on a GET route probe does not establish generation-channel availability. Seedance's published create/query schema remains unchanged from the 2026-10-23 snapshot; channel failures require investigation in the upstream gateway.

## Models

The company gateway remains the default API Base. Provider contracts were checked against its OpenAPI schema and public frontend on 2026-09-14.

| Page | Model | Create / Query | Options |
| --- | --- | --- | --- |
| Image | GPT Image 2.5 | `/gen_img_4o` / `/gen_img_4o_query` | Flare and Sunburst; 1K/2K/4K dimensions; independent low/medium/high/xhigh/max render quality; auto/transparent/opaque background; up to four images |
| Image to video | Seedance 2.5 | `/seedance2` / `/seedance2_query` | Text or first/last frames; automatic (-1) or 4-30 seconds; 480p/720p/1080p; MP4/MOV; generated audio |
| Multimodal video | Seedance 2.5 | `/seedance2` / `/seedance2_query` | Up to 30 references; at most 10 videos and 10 audios; per-type duration limits; audio-only references supported |

Seedance 2.5 defaults to 1080p and 10 seconds. Its request model name is `seedance2.5`. GPT model names are `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst`. Existing models retain their own contracts.

The company `/seedance2` OpenAPI description was rechecked on 2026-09-15: output `duration` accepts `-1` as well as integers 4-30 for Seedance 2.5. Both video pages offer automatic duration and submit the numeric value `-1`, preserving it through row persistence and history reuse. This does not change the required positive durations of reference clips. The schema does not document a separate video-editing switch tied to `-1`; use multimodal video references and the prompt to describe the intended edit.

Agent callers discover current options from the capability manifest. Additional row options are `renderQuality`, `background`, and `outputFormat`. Generation records retain the submitted payload so history reuse and grouping distinguish these settings.

## Prompt Library

Each task family has an independent history and favorites collection. Open the library from a row or the full-prompt editor. Search, favorite, copy, or apply a prompt to an unlocked row. Valid task submissions record the prompt automatically. Available old generation prompts are imported once by task family and exact normalized text; internal whitespace is preserved.

Browser storage uses the dedicated IndexedDB database `api_console_prompt_library_db_v1`, including a durable unsent-operation queue. The local service saves prompt operations in its configured data directory. Browser clients merge individual operations instead of replacing another browser's whole collection. Each family retains 1000 recent nonfavorite entries; favorites are protected. Personal prompt content is excluded from source packages.

The local routes `/api/prompt-library` and `/api/prompt-library/events` use the existing same-origin browser session. They are not an unauthenticated remote API.

## Performance and Editing

- The asset picker renders at most 50 entries per page. Grid rows use content height and a fixed 120px preview area; only the content area scrolls.
- Video posters begin loading near the visible area; images use lazy loading.
- Prompt edits update their row immediately and coalesce synchronous queue saves. Blur, page hiding, and full-editor closing flush pending edits. Provider task IDs still use immediate persistence.
- Reference token insertion retains the chosen caret and scroll position. Prompt blur no longer rebuilds the page before a reference click.
- Worker claims select the needed task rather than cloning the entire store for every candidate. Heartbeats honor their interval, and lease events share one snapshot per batch after each event reaches the journal.
- Unchanged prompt-library revisions use one lightweight request, without full-cache reads, hashing, or writes. Regressed or unexpectedly empty server state does not replace acknowledged local prompts.

Synthetic baseline: 500 tasks and 12 active tasks reduced an empty claim from about 544ms to 1ms, full-store clones from 502 to zero, and heartbeat snapshots from 12 to one. These are regression measurements, not a diagnosis of every possible browser or GPU crash.

## Verification

Run `npm test`. Model payloads, task recovery, concurrent prompt writes, favorites, exact deduplication, and bounded layout are covered. Optional real-browser prompt-storage tests use `PROMPT_LIBRARY_PLAYWRIGHT` pointing to an installed Playwright module. The isolated browser smoke test uses mocked provider responses; it does not incur generation charges.
