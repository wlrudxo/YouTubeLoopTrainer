# PhraseLoop Implementation Plan

## 1. Proposed Project Structure

```text
.
├── docs/
│   ├── PRD.md
│   └── IMPLEMENTATION_PLAN.md
├── public/
│   └── manifest.json
├── src/
│   ├── content/
│   │   ├── index.ts
│   │   ├── captionLabels.ts
│   │   ├── loopEngine.ts
│   │   ├── panel.ts
│   │   ├── shortcuts.ts
│   │   ├── visibleCaptionCollector.ts
│   │   ├── youtube.ts
│   │   └── content.css
│   ├── popup/
│   │   ├── index.html
│   │   ├── index.ts
│   │   └── popup.css
│   ├── shared/
│   │   ├── captions.ts
│   │   ├── constants.ts
│   │   ├── ids.ts
│   │   ├── importExport.ts
│   │   ├── labels.ts
│   │   ├── storage.ts
│   │   ├── time.ts
│   │   ├── types.ts
│   │   └── validation.ts
│   └── test/
│       ├── importExport.test.ts
│       ├── labels.test.ts
│       ├── time.test.ts
│       └── validation.test.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

The exact structure can be adjusted during scaffolding, but content script code, popup code, and shared pure logic should stay separated.

## 2. Data Model

Define shared types in `src/shared/types.ts`.

```ts
export type PhraseLoopData = {
  schemaVersion: 1;
  videos: Record<string, VideoLoops>;
};

export type VideoLoops = {
  videoId: string;
  title: string;
  url: string;
  loops: Loop[];
};

export type Loop = {
  id: string;
  start: number;
  end: number;
  label: string;
  updatedAt: string;
};

export type DraftLoop = {
  markerA: number | null;
  markerB: number | null;
  label: string;
  labelDirty: boolean;
};
```

Use a single root object in `chrome.storage.local`, for example under key `phraseLoopData`. This keeps local storage readable and makes export/import straightforward.

## 3. Build and Extension Setup

1. Initialize package metadata and install Vite, TypeScript, and a unit test runner.
2. Configure Vite with separate entries for:
   - content script
   - popup script
   - popup HTML
3. Add `public/manifest.json` with Manifest V3 settings.
4. Ensure build output can be loaded as an unpacked Chrome Extension.

Recommended manifest capabilities:

```json
{
  "manifest_version": 3,
  "name": "PhraseLoop",
  "version": "0.1.0",
  "permissions": ["storage", "unlimitedStorage"],
  "host_permissions": ["https://www.youtube.com/*"],
  "action": {
    "default_popup": "popup/index.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content/index.js"],
      "css": ["content/content.css"]
    }
  ]
}
```

The generated file paths may differ depending on Vite configuration.

## 4. Shared Logic Modules

### Time Formatting

`src/shared/time.ts`

Responsibilities:

- Format seconds as `MM:SS.t` or `H:MM:SS.t` when needed.
- Generate time range labels.

Examples:

- `72.4 -> 01:12.4`
- `3723.8 -> 1:02:03.8`
- `72.4, 78.9 -> 01:12.4 - 01:18.9`

### Validation

`src/shared/validation.ts`

Responsibilities:

- Sort draft markers into `start` and `end`.
- Reject missing markers.
- Reject `start >= end`.
- Reject loops shorter than 1.0 second.
- Return structured errors so the panel can show concise messages.

### Labels

`src/shared/labels.ts`

Responsibilities:

- Normalize labels for duplicate detection.
- Apply empty-label fallback.
- Support dirty flag behavior in content state.
- Fall back from empty user input to the generated default label.

Normalization rules:

- `trim`
- lowercase
- collapse consecutive whitespace

### Caption Text

`src/shared/captions.ts`

Responsibilities:

- Clean visible caption text.
- Remove caption markup.
- Remove bracketed non-speech annotations such as `[Music]`.
- Collapse whitespace.
- Join unique visible caption samples for a readable loop label.

### IDs

`src/shared/ids.ts`

Responsibilities:

- Generate stable loop IDs.
- Use a prefix such as `lp_`.
- Prefer `crypto.randomUUID()` when available, with a fallback.

### Storage

`src/shared/storage.ts`

Responsibilities:

- Read all PhraseLoop data.
- Write all PhraseLoop data.
- Get video data by `videoId`.
- Upsert video metadata.
- Add loop.
- Rename loop.
- Delete loop.
- Keep loops sorted by `start`.

### Import/Export

`src/shared/importExport.ts`

Responsibilities:

- Build export payload.
- Validate imported payload shape.
- Merge imported data into existing data.
- Replace existing data with imported data.

Merge algorithm:

1. For each imported video, find or create the local video entry by `videoId`.
2. For each imported loop:
   - If same `id` exists:
     - Use imported loop only if imported `updatedAt` is newer.
     - Otherwise keep existing loop.
   - Else if near-identical time range and normalized label match:
     - Treat as duplicate and skip.
   - Else:
     - Add imported loop.
3. Preserve both loops when time range is near-identical but labels differ.
4. Sort loops by `start`.

## 5. Content Script Plan

### Boot Flow

`src/content/index.ts`

1. Wait for YouTube watch page readiness.
2. Extract `videoId` from the current URL.
3. Find the YouTube `video` element.
4. Load saved loops for the current `videoId`.
5. Insert or update the PhraseLoop panel.
6. Start shortcut listeners.
7. Start loop engine.
8. Start YouTube SPA navigation detection.

### YouTube Helpers

`src/content/youtube.ts`

Responsibilities:

- Extract `videoId` from URL.
- Read video title.
- Read canonical watch URL.
- Find the `video` element.
- Find panel insertion target:
  - first `#secondary`
  - fallback `#below`
- Listen for `yt-navigate-finish`.
- Poll URL/videoId as fallback.

### Caption Labels

`src/content/captionLabels.ts`

Responsibilities:

- Read currently visible YouTube caption text from `.ytp-caption-segment`.
- Return `null` when no usable caption text is available.

### Visible Caption Collector

`src/content/visibleCaptionCollector.ts`

Responsibilities:

- Start sampling visible caption DOM when the first marker is set.
- Stop sampling when the second marker is set.
- Join unique visible caption samples into the draft label.
- Reset collection on save, video navigation, and page unload.

If no visible caption text is collected, the content script keeps the time-range label fallback. Captions skipped by seeking are not collected.

### Panel UI

`src/content/panel.ts`

Responsibilities:

- Render the in-page PhraseLoop panel using plain DOM.
- Display marker A and marker B.
- Display label input.
- Display Save Loop button and validation messages.
- Display saved loop list.
- Display active loop state.
- Support collapse/expand.
- Support inline rename.
- Support delete confirmation.

Panel event actions:

- Set A button calls `setMarkerA`.
- Set B button calls `setMarkerB`.
- Save button calls `saveDraftLoop`.
- Loop item click calls `startLoop`.
- Stop button calls `stopLoop`.
- Rename uses inline input.
- Delete asks for confirmation, then removes loop.

### Shortcuts

`src/content/shortcuts.ts`

Responsibilities:

- Register `keydown` listener.
- Guard typing targets.
- Map shortcuts:
  - `[` set A
  - `]` set B
  - `\` save draft
  - `Esc` stop active loop
  - `Enter` save only while PhraseLoop label input is focused

Typing target helper:

```ts
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();

  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    !!target.closest("[contenteditable='true']")
  );
}
```

### Loop Engine

`src/content/loopEngine.ts`

Responsibilities:

- Track active loop.
- Start loop playback by seeking to `start` and calling `video.play()`.
- Stop active loop.
- Monitor current time while active.
- Seek back to `start` when `currentTime >= end`.

Recommended MVP tick:

```ts
const LOOP_TICK_MS = 100;
```

Use a simple interval for MVP, and clean it up if the video changes.

### SPA Navigation

When `videoId` changes:

1. Stop active loop.
2. Clear draft markers and label state.
3. Load loops for new video.
4. Refresh video metadata.
5. Reinsert or update panel placement.
6. Rebind current `video` element if necessary.

## 6. Popup Plan

`src/popup/index.ts`

Responsibilities:

- Render export button.
- Render import file picker.
- Render import mode control:
  - Merge
  - Replace
- Default import mode to Merge.
- Show import/export status messages.

Export flow:

1. Read all PhraseLoop data from `chrome.storage.local`.
2. Wrap it in export metadata:
   - `app`
   - `schemaVersion`
   - `exportedAt`
   - `source`
   - `data`
3. Download JSON file.

Import flow:

1. User selects JSON file.
2. Parse JSON.
3. Validate app/schema shape.
4. If Merge:
   - merge imported data with local data.
5. If Replace:
   - replace local data with imported data.
6. Show a concise summary:
   - videos processed
   - loops added
   - loops updated
   - duplicates skipped

## 7. Styling Plan

Content panel:

- Compact card-like panel.
- Keep YouTube visual density in mind.
- Avoid covering the video.
- Use stable dimensions for buttons and rows.
- Ensure labels truncate cleanly where needed.
- Make active loop visually clear.
- Make newly saved loop highlight temporary and subtle.

Popup:

- Small utility UI.
- Export button.
- Import mode segmented/radio control.
- File input.
- Status area.

## 8. Unit Test Plan

Use unit tests for pure shared logic.

Test files:

- `time.test.ts`
- `validation.test.ts`
- `labels.test.ts`
- `importExport.test.ts`

Required cases:

- Format seconds into display time.
- Generate default time range label.
- Clean and join visible caption text.
- Validate missing A.
- Validate missing B.
- Validate under-1-second loop rejection.
- Reject reversed marker order.
- Normalize labels.
- Merge same ID.
- Update same ID when imported `updatedAt` is newer.
- Keep existing same ID when imported `updatedAt` is missing or older.
- Deduplicate same time range and same normalized label.
- Preserve both loops for same time range but different labels.
- Sort merged loops by `start`.

DOM, YouTube SPA behavior, and actual video control can be manually verified for MVP.

## 9. Suggested Implementation Order

1. Scaffold Plain TypeScript + Vite Chrome Extension.
2. Add shared types, time formatting, validation, labels, and ID helpers.
3. Add storage wrapper around `chrome.storage.local`.
4. Add import/export merge logic and unit tests.
5. Add Manifest V3 and popup shell.
6. Implement popup export/import.
7. Implement YouTube helpers and content script boot.
8. Implement panel rendering and draft marker controls.
9. Implement save, list, rename, and delete.
10. Implement shortcut handling.
11. Implement loop engine and active loop UI.
12. Implement SPA navigation handling.
13. Build extension and load it manually in Chrome.
14. Verify on YouTube:
    - first page load
    - related-video navigation
    - marker shortcuts
    - save behavior
    - loop playback
    - rename/delete
    - export/import merge

## 10. Manual Verification Checklist

- Open a YouTube watch page and confirm the panel appears in the right sidebar.
- Resize window and confirm fallback placement below the video if needed.
- Set A and B using buttons.
- Set A and B using shortcuts.
- Set B before A, save, and confirm times are sorted.
- Confirm under-1-second loops are rejected.
- Edit the draft label, change A/B, and confirm custom label is preserved.
- Save a loop and confirm playback is unchanged.
- Click the saved loop and confirm repeat starts.
- Press `Esc` and confirm repeat stops.
- Rename a loop with Enter, blur, and Esc paths.
- Delete a loop and confirm active loop stops if deleted.
- Navigate to another video in the same tab and confirm panel data updates.
- Export JSON from popup.
- Import JSON with Merge and confirm duplicate behavior.
- Import JSON with Replace and confirm replacement behavior.
