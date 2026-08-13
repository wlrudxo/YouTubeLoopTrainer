# PhraseLoop

PhraseLoop is a Chrome Extension that captures A-B loop sections on YouTube and sends them to a local companion server for dictation practice. The companion (`scripts/companion/`) is the single source of truth for all saved loops, transcripts, and generated media; the extension is only a capture and send queue.

## Features

- Set A/B markers on the current YouTube video and fine-tune them with a trim editor
- Preview or repeat the draft loop before sending
- Auto-generate loop labels from visible YouTube captions when captions are enabled
- Fall back to time-range labels when caption text is unavailable
- Send the loop to the local dictation companion with one click
- Pending queue: loops that could not be sent (companion off, send failed) stay in the extension until sent or deleted
- Keyboard shortcuts for fast loop creation

## How It Works

PhraseLoop runs as a content script on YouTube watch pages and controls the existing `HTMLVideoElement` directly:

1. Set marker A and marker B from the current playback time.
2. Optionally trim the range and edit the caption-based label.
3. Save. The loop is written to `chrome.storage.local` and immediately sent to the companion (`POST /import`, proxied through the extension service worker).
4. On success the loop is deleted from extension storage. On failure it stays pending; retry from the popup with **Send all**.

Presence in `chrome.storage.local` means "not yet sent" — the extension never keeps loops that the companion has accepted.

Caption-based labels are collected from visible YouTube caption text while marking A to B. PhraseLoop does not fetch or store full transcripts.

## Popup

The toolbar popup shows the pending queue:

- Each pending loop with its video title, label, and time range
- **Send all** to retry sending every pending loop
- Per-loop delete
- **Open Dictation** to open the companion web app
- Settings shortcut

## Installation for Development

```bash
npm install
npm run build
```

Then load the built extension in Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `dist` folder

After making code changes, run `npm run build` again and reload the extension from `chrome://extensions`.

## Usage

1. Start the companion (`npm run companion`) and pair it once in Settings.
2. Open a YouTube video and expand the PhraseLoop panel in the right sidebar.
3. Enable YouTube captions if you want caption-based loop names.
4. Click `A` at the start of the phrase and `B` at the end.
5. Adjust the range and label if needed, then save. The loop is sent to the companion.

## Shortcuts

Global shortcuts are ignored while typing in inputs, textareas, selects, or editable fields.

| Key | Action |
| --- | --- |
| `[` | Set A |
| `]` | Set B |
| `\` | Save & send loop |
| `Esc` | Stop active loop |
| `Enter` | Save while the PhraseLoop label field is focused |

## Data Model

The extension stores only pending (not yet sent) loops in `chrome.storage.local`:

```json
{
  "schemaVersion": 1,
  "videos": {
    "videoId": {
      "videoId": "videoId",
      "title": "Video title",
      "channelTitle": "Channel name",
      "url": "https://www.youtube.com/watch?v=videoId",
      "loops": [
        {
          "id": "lp_...",
          "start": 72.4,
          "end": 78.9,
          "label": "could have been better",
          "createdAt": "2026-05-19T12:00:00.000Z",
          "updatedAt": "2026-05-19T12:00:00.000Z"
        }
      ]
    }
  }
}
```

A video entry is removed as soon as its last loop is sent or deleted.

## Development

```bash
npm run build
npm test
npx tsc --noEmit
```

## Local Dictation Companion

The companion stores imported loops and generated MP3 files in a local `PhraseLoopData` folder and serves the dictation review UI on `127.0.0.1`.

Requirements: `yt-dlp` and `ffmpeg` must be available on `PATH`. For automatic card creation, install AnkiConnect (add-on code `2055492159`) and keep Anki Desktop running while adding cards.

```powershell
npm run companion
```

On first run, copy the token printed by the command (or read it from `PhraseLoopData/config.json`). In the extension Settings page, enter the token under **Local Dictation Companion** and click **Save & Connect**. Saved YouTube loops are then sent automatically; failed sends stay in the popup queue.

Open `http://127.0.0.1:17311` to practice dictation, correct the captured caption draft, and add optional meaning, notes, and tags. The inbox opens the first item not yet added to Anki and advances after each add or discard. Discarded items stay tombstoned and are not recreated by later imports. Items can be added directly to the `English::PhraseLoop` Anki deck. Anki export is add-only: adding an already-added item again creates another note. The card plays only the audio on the front and shows the transcript, optional meaning, notes, local thumbnail, and source details on the back. All source metadata, review data, and generated media remain in the local `PhraseLoopData` folder.

PhraseLoop creates the `PhraseLoop Dictation` note type only when it is missing. For an existing note type it verifies the required fields and only fills their values; card templates, styling, field order, and user-added fields remain under the user's control in Anki.

## Current Scope

The extension is intentionally minimal: capture A-B loops on YouTube and send them to the local companion. Loop management, review, transcripts, and Anki integration all live in the companion.

Out of scope for the extension:

- Storing a permanent loop library (the companion owns all sent loops)
- Full transcript fetching
- Notes and translations
- Automatic cross-device sync
- Chrome Web Store packaging

## License

MIT
