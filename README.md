# PhraseLoop

PhraseLoop is a Chrome Extension for saving and replaying multiple A-B loops on YouTube. It is built for language listening, shadowing, and review workflows where you want to capture difficult phrases and replay them later.

## Features

- Save multiple A-B loops per YouTube video
- Click a saved loop to jump to the range and start repeat playback
- Auto-generate loop names from visible YouTube captions when captions are enabled
- Fall back to time-range labels when caption text is unavailable
- Rename and delete saved loops inline
- Mark loops as `New`, `Hard`, or `Done`
- Manually save and restore progress per video
- Browse saved videos and loops in the extension Library
- Export and import the local library as JSON
- Keyboard shortcuts for fast loop creation

## How It Works

PhraseLoop runs as a content script on YouTube watch pages. It controls the existing `HTMLVideoElement` directly:

- Set marker A from the current playback time
- Set marker B from the current playback time
- Save the valid range to `chrome.storage.local`
- Click a saved loop to seek to `start` and repeat until `end`

Caption-based labels are collected from visible YouTube caption text while marking A to B. PhraseLoop does not fetch or store full transcripts.

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

1. Open a YouTube video.
2. Expand the PhraseLoop panel in the right sidebar.
3. Enable YouTube captions if you want caption-based loop names.
4. Click `A` at the start of the phrase.
5. Click `B` at the end of the phrase.
6. Edit the generated label if needed.
7. Save the loop.
8. Click any saved loop to start repeat playback.

## Shortcuts

Global shortcuts are ignored while typing in inputs, textareas, selects, or editable fields.

| Key | Action |
| --- | --- |
| `[` | Set A |
| `]` | Set B |
| `\` | Save Loop |
| `Esc` | Stop active loop |
| `Enter` | Save while the PhraseLoop label field is focused |

## Library and Backup

PhraseLoop stores data locally with `chrome.storage.local`. It does not use automatic Chrome sync or OneDrive sync.

Use the extension settings page to:

- Export your library as JSON
- Import a JSON backup
- Merge imported data into the current library
- Replace the current library with imported data

Merge mode avoids data loss by deduplicating loops by stable ID first, then by near-identical time ranges and normalized labels.

## Data Model

PhraseLoop stores compact per-video data:

```json
{
  "schemaVersion": 1,
  "videos": {
    "videoId": {
      "videoId": "videoId",
      "title": "Video title",
      "channelTitle": "Channel name",
      "url": "https://www.youtube.com/watch?v=videoId",
      "progress": {
        "time": 123.4,
        "updatedAt": "2026-05-19T12:00:00.000Z"
      },
      "loops": [
        {
          "id": "lp_...",
          "start": 72.4,
          "end": 78.9,
          "label": "could have been better",
          "status": "hard",
          "updatedAt": "2026-05-19T12:00:00.000Z"
        }
      ]
    }
  }
}
```

## Development

```bash
npm run build
npm test
npx tsc --noEmit
```

## Anki Media Export

PhraseLoop can export saved loops as Anki metadata, then a local Windows script can create media files and a CSV import file.

Requirements:

```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

1. Open PhraseLoop Settings.
2. Click `Export Anki JSON`.
3. Run the local generator. By default it downloads only each loop section, which is best for long videos and many short clips:

```powershell
node scripts/export-anki.mjs "$env:USERPROFILE\Downloads\phraseloop-anki-YYYY-MM-DD.json" "$env:USERPROFILE\Desktop\phraseloop-anki"
```

The output folder contains:

```text
phraseloop-anki/
  phraseloop-anki.csv
  media/
    lp_....mp3
```

Import `phraseloop-anki.csv` into Anki and copy the files from `media/` into your Anki collection media folder. The CSV uses `[sound:...]` references for each loop.

## Local Dictation Companion

The companion stores imported loops and generated MP3 files in a local `PhraseLoopData` folder and serves the dictation review UI on `127.0.0.1`.

Requirements: `yt-dlp` and `ffmpeg` must be available on `PATH`. For automatic card creation, install AnkiConnect (add-on code `2055492159`) and keep Anki Desktop running while adding or updating cards.

```powershell
npm run companion
```

On first run, copy the token printed by the command (or read it from `PhraseLoopData/config.json`). In the extension Settings page, enter the token under **Local Dictation Companion** and click **Save & Connect**. A saved YouTube loop can then be sent with its **Send** button.

Open `http://127.0.0.1:17311` to practice dictation, correct the captured caption draft, assign difficulty and tags, and mark the transcript reviewed. Reviewed items can be added directly to the `English::PhraseLoop` Anki deck; sending the same LoopId again updates the existing note. All source metadata, review data, and generated media remain in the local `PhraseLoopData` folder.

Optional video clips:

```powershell
node scripts/export-anki.mjs .\phraseloop-anki.json .\anki-export --media video
```

Optional source caching mode:

```powershell
node scripts/export-anki.mjs .\phraseloop-anki.json .\anki-export --cache-source
```

This downloads each source video/audio once and cuts clips locally. It is usually less efficient for very long videos spread across many sources.

## Current Scope

PhraseLoop is currently an MVP. The extension focuses on A-B loop creation, replay, local storage, Library management, progress markers, and JSON import/export.

Out of scope for the current version:

- Full transcript fetching
- Notes and translations
- Anki export
- Automatic cross-device sync
- Chrome Web Store packaging

## License

MIT
