# PhraseLoop PRD

## 1. Overview

PhraseLoop is a Chrome Extension for listening and shadowing practice on YouTube. Users can save multiple A-B loop segments for a YouTube video, then click any saved segment to immediately jump to that range and repeat it.

The product focuses on a language learning workflow:

1. Open a YouTube interview, lecture, or language video.
2. Notice a sentence or phrase that is hard to hear.
3. Mark the start and end points.
4. Save the segment with a useful label.
5. Replay saved segments for practice and review.
6. Return to the same video later and see the saved loop list.

Existing YouTube loopers often focus on one active loop. PhraseLoop is designed around saving, naming, reviewing, and replaying many difficult segments per video.

## 2. MVP Goals

### Core Goals

- Save multiple A-B loop segments per YouTube video.
- Load saved loops automatically when the same YouTube video is opened again.
- Click a saved loop to jump to its start time and repeat the segment.
- Support fast loop creation through both panel buttons and single-key shortcuts.
- Support manual JSON export/import for backup and moving data between PCs.

### Out of Scope for MVP

- Chrome account sync through `chrome.storage.sync`.
- OneDrive or folder-based automatic backup.
- Notes, transcripts, translations, Anki export, and study logs.
- Bookmarks or automatic watch-position tracking.
- YouTube Player API integration.
- Floating panel mode and player-overlay mode.

## 3. Target Users

Primary users are people who use YouTube videos to practice listening, shadowing, dictation, or pronunciation in languages such as English, Japanese, Chinese, and Korean.

## 4. MVP Feature Requirements

### 4.1 A-B Marker Creation

Users can set two marker times from the current YouTube video playback position.

Requirements:

- Read `HTMLVideoElement.currentTime` from the YouTube page.
- Support setting marker A.
- Support setting marker B.
- A and B may be set in any order.
- On save, compute:
  - `start = min(A, B)`
  - `end = max(A, B)`
- Marker setting must not change playback position or playback state.

Validation:

- Save is disabled or rejected if A is missing.
- Save is disabled or rejected if B is missing.
- Save is rejected if `start >= end`.
- Save is rejected if `end - start < 1.0` seconds.

### 4.2 Draft Label

Each saved loop must have a label.

Requirements:

- If YouTube captions are visible during A-B marking, the default label should use the visible caption text collected between the first marker press and the second marker press.
- If no visible caption text is collected, a default label is generated from the sorted time range.
- Time fallback format: `01:12.4 - 01:18.9`
- The label input is editable before save.
- Empty or whitespace-only label input falls back to the generated caption label, or the time-range label if no caption label is available.
- After a successful save, A marker, B marker, label input, and label dirty state are cleared.

Draft label dirty flag:

- When both markers are present, PhraseLoop auto-populates the label input with collected visible caption text when possible, otherwise the time-range label.
- As long as the user has not manually edited the label, marker changes update the label automatically.
- Once the user edits the label, PhraseLoop preserves that custom label even if A or B changes.
- The dirty flag resets after save.

Caption label constraints:

- Use visible YouTube caption DOM, such as `.ytp-caption-segment`.
- Start collecting visible captions when the first marker is set.
- Stop collecting visible captions when the second marker is set.
- Save uses the collected caption label, unless the user manually edited the label.
- If the user skips over part of the video, skipped captions are not collected because they were never shown on screen.
- If no visible caption text is collected, keep the time-range fallback.
- Do not fetch timed transcripts, call YouTube internal transcript APIs, or store full transcripts in MVP.

### 4.3 Save Behavior

Saving a valid draft stores the loop and adds it to the current video's loop list.

Requirements:

- Save does not change `currentTime`.
- Save does not change play/pause state.
- The newly saved item is briefly highlighted in the saved loop list.
- Save does not automatically start loop playback.
- A future `Save & Loop` action may save and immediately start playback, but it is not required for MVP.

### 4.4 Saved Loop Playback

Saved loop items are the primary playback entry point.

Requirements:

- Clicking a saved loop item immediately jumps to the loop start time.
- Clicking a saved loop item starts A-B repeat playback.
- Clicking the active loop again restarts it from the start.
- The active loop is visually highlighted.
- `Esc` stops active loop playback.
- A Stop button should also be available.

Loop engine:

- Use `document.querySelector("video")` to access the YouTube `HTMLVideoElement`.
- Do not use the YouTube Player API for MVP.
- While an active loop exists, monitor `video.currentTime`.
- When `video.currentTime >= activeLoop.end`, set `video.currentTime = activeLoop.start`.
- Keep the loop engine simple and robust enough for language learning, not frame-perfect music looping.

### 4.5 Rename and Delete

Saved loop labels can be edited and loops can be deleted.

Rename requirements:

- Use inline rename.
- Do not use prompt or modal rename.
- `Enter` saves the new label.
- `Esc` cancels editing.
- Blur saves the new label.
- If the new label is empty or whitespace-only, keep the previous label.
- Successful rename updates `updatedAt`.

Delete requirements:

- Use a delete button on each loop row.
- Confirm before deleting.
- Undo delete is out of scope for MVP.
- If the deleted loop is active, stop active loop playback.

### 4.6 Keyboard Shortcuts

MVP supports both panel buttons and single-key shortcuts.

Default shortcuts:

- `[` sets marker A.
- `]` sets marker B.
- `\` saves the current valid draft.
- `Enter` saves only while PhraseLoop's label input is focused.
- `Esc` stops active loop playback.

Shortcut guard rules:

- Ignore global shortcuts while focus is inside `input`, `textarea`, or `select`.
- Ignore global shortcuts while focus is inside `contenteditable`.
- Ignore global shortcuts while the user is typing in YouTube search or comment fields.
- For PhraseLoop label input, ignore global shortcuts except `Enter` for save and `Esc` for normal editing behavior where applicable.

### 4.7 YouTube Page Placement

The in-page PhraseLoop panel appears on the YouTube watch page.

Placement priority:

1. Insert at the top of the desktop right sidebar, such as `#secondary`.
2. If the right sidebar is unavailable due to narrow layout or YouTube DOM changes, insert below the video player, such as near `#below`.
3. Fixed/floating fallback should be minimal and only used if necessary.

Panel requirements:

- Show marker controls.
- Show marker times.
- Show label input.
- Show Save Loop button.
- Show saved loop list.
- Include collapse/expand control.

Floating panels and player overlays are out of scope for MVP.

### 4.8 YouTube SPA Navigation

YouTube watch pages behave like a single-page application. MVP must handle video changes within the same tab.

Requirements:

- Track the current `videoId`.
- Listen for `yt-navigate-finish` where available.
- Include URL/videoId polling as a fallback.
- When `videoId` changes:
  - Stop active loop playback.
  - Clear draft state.
  - Load loops for the new video.
  - Update video title and URL metadata.
  - Re-check panel placement and reinsert if necessary.

### 4.9 Storage

MVP uses `chrome.storage.local` as the primary persistence layer.

Requirements:

- Do not use `chrome.storage.sync` for MVP.
- Do not implement automatic OneDrive or folder sync for MVP.
- Consider including the `unlimitedStorage` permission.
- Use readable field names rather than compact sync-oriented names.

Canonical storage shape:

```json
{
  "schemaVersion": 1,
  "videos": {
    "dQw4w9WgXcQ": {
      "videoId": "dQw4w9WgXcQ",
      "title": "Video title",
      "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "loops": [
        {
          "id": "lp_abc123",
          "start": 72.4,
          "end": 78.9,
          "label": "could have been better",
          "updatedAt": "2026-05-19T12:00:00.000Z"
        }
      ]
    }
  }
}
```

Loop IDs must be stable so imported data can be merged safely.

### 4.10 JSON Export and Import

Manual JSON export/import is required for MVP.

UI placement:

- Export/import controls live in the extension popup.
- The in-page YouTube panel remains focused on loop creation, playback, rename, and delete.

Export file format:

```json
{
  "app": "PhraseLoop",
  "schemaVersion": 1,
  "exportedAt": "2026-05-19T12:00:00.000Z",
  "source": {
    "browser": "chrome",
    "storage": "local"
  },
  "data": {
    "videos": {}
  }
}
```

Import modes:

- Merge
- Replace

Default import mode:

- Merge

Merge requirements:

- Merge videos by `videoId`.
- Deduplicate first by same `videoId` and same `loop.id`.
- If the same ID exists and imported `updatedAt` is newer, update the existing loop.
- If the same ID exists and imported `updatedAt` is missing, keep the existing loop.
- Deduplicate second by near-identical time range and normalized label:
  - same `videoId`
  - `abs(startA - startB) < 0.15`
  - `abs(endA - endB) < 0.15`
  - normalized labels are equal
- If time range is near-identical but labels differ, preserve both loops to avoid data loss.
- Sort loops by `start` after import.

Label normalization:

- Trim leading and trailing whitespace.
- Convert to lowercase.
- Collapse consecutive whitespace into a single space.

Replace requirements:

- Replace current stored data with imported data.
- Create an in-memory backup before replacement where practical, so the implementation can fail safely before committing.

## 5. Technical Direction

### Extension Architecture

- Manifest V3.
- Content script for YouTube page panel, video control, shortcuts, and SPA handling.
- Popup for JSON export/import.
- `chrome.storage.local` for data persistence.

Manifest requirements:

- `manifest_version: 3`
- `permissions`: `storage`, consider `unlimitedStorage`
- `host_permissions`: `https://www.youtube.com/*`
- `action.default_popup` for popup UI
- Content script matching YouTube watch pages

### Implementation Stack

- Plain TypeScript.
- Vite.
- No React for MVP.
- Shared TypeScript modules for data models, storage, time formatting, validation, and import merge logic.

## 6. Future Candidates

- Save & Loop action.
- One manual bookmark per video for learning position.
- Export to Anki.
- Subtitle/transcript integration.
- Translation support.
- Study log/history.
- Optional cloud backup or sync.
- Floating panel mode.
- Configurable keyboard shortcuts.
