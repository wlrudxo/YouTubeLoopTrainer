import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const args = parseArgs(process.argv.slice(2));

if (!args.input || !args.outputDir || args.help) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const inputPath = resolve(args.input);
const outputDir = resolve(args.outputDir);
const cacheDir = join(outputDir, "cache");
const mediaDir = join(outputDir, "media");
const payload = JSON.parse(await readFile(inputPath, "utf8"));
const loops = parseLoops(payload);

await mkdir(cacheDir, { recursive: true });
await mkdir(mediaDir, { recursive: true });

const rows = [["Phrase", "Source", "Audio", "Video", "Start", "End", "YouTube", "Status", "LoopId"]];

for (const loop of loops) {
  const mediaFile = args.media === "video" ? `${safeFilename(loop.id)}.mp4` : `${safeFilename(loop.id)}.mp3`;
  const mediaPath = join(mediaDir, mediaFile);

  if (!args.skipMedia) {
    if (args.cacheSource) {
      const sourcePath = await ensureSourceMedia(loop, cacheDir, args.media);
      await cutLoopMedia(sourcePath, mediaPath, loop, args.media);
    } else {
      await downloadLoopSection(loop, mediaPath, args.media);
    }
  }

  rows.push([
    loop.label,
    loop.videoTitle,
    args.media === "audio" || args.skipMedia ? `[sound:${mediaFile}]` : "",
    args.media === "video" && !args.skipMedia ? `[sound:${mediaFile}]` : "",
    loop.start.toFixed(1),
    loop.end.toFixed(1),
    loop.url,
    loop.status ?? "",
    loop.id
  ]);
}

const csvPath = join(outputDir, "phraseloop-anki.csv");
await writeFile(csvPath, rows.map(toCsvRow).join("\r\n"), "utf8");

console.log(`Loops: ${loops.length}`);
console.log(`CSV: ${csvPath}`);
console.log(`Media: ${mediaDir}`);
if (args.skipMedia) {
  console.log("Media generation skipped.");
} else if (args.cacheSource) {
  console.log(`Cache: ${cacheDir}`);
}

function parseArgs(rawArgs) {
  const parsed = {
    input: "",
    outputDir: "",
    media: "audio",
    cacheSource: false,
    skipMedia: false,
    help: false
  };

  const positional = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--skip-media") {
      parsed.skipMedia = true;
    } else if (arg === "--cache-source") {
      parsed.cacheSource = true;
    } else if (arg === "--media") {
      const next = rawArgs[index + 1];
      if (next !== "audio" && next !== "video") {
        throw new Error("--media must be audio or video.");
      }
      parsed.media = next;
      index += 1;
    } else {
      positional.push(arg);
    }
  }

  parsed.input = positional[0] ?? "";
  parsed.outputDir = positional[1] ?? "";
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node scripts/export-anki.mjs <phraseloop-anki.json> <output-dir> [--media audio|video] [--cache-source] [--skip-media]

Examples:
  node scripts/export-anki.mjs "$env:USERPROFILE\\Downloads\\phraseloop-anki-2026-05-26.json" "$env:USERPROFILE\\Desktop\\phraseloop-anki"
  node scripts/export-anki.mjs .\\phraseloop-anki.json .\\anki-export --media video
  node scripts/export-anki.mjs .\\phraseloop-anki.json .\\anki-export --cache-source
  node scripts/export-anki.mjs .\\phraseloop-anki.json .\\anki-export --skip-media
`);
}

function parseLoops(payload) {
  if (payload?.app !== "PhraseLoopAnkiExport" || !Array.isArray(payload.loops)) {
    throw new Error("Input must be a PhraseLoop Anki export JSON file.");
  }

  return payload.loops.map((loop) => {
    if (
      typeof loop.id !== "string" ||
      typeof loop.videoId !== "string" ||
      typeof loop.videoTitle !== "string" ||
      typeof loop.url !== "string" ||
      typeof loop.start !== "number" ||
      typeof loop.end !== "number" ||
      typeof loop.label !== "string"
    ) {
      throw new Error("Invalid loop item in Anki export JSON.");
    }

    return loop;
  });
}

async function ensureSourceMedia(loop, targetDir, media) {
  const ext = media === "video" ? "mp4" : "mp3";
  const target = join(targetDir, `${safeFilename(loop.videoId)}.${ext}`);
  if (existsSync(target)) {
    return target;
  }

  const url = loop.url || `https://www.youtube.com/watch?v=${loop.videoId}`;
  const args =
    media === "video"
      ? ["--no-playlist", "-f", "bv*+ba/b", "-o", target, "--merge-output-format", "mp4", url]
      : ["--no-playlist", "-f", "bestaudio*/bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "0", "-o", target, url];
  await run("yt-dlp", args);
  return findDownloadedFile(target, targetDir, loop.videoId);
}

async function downloadLoopSection(loop, outputPath, media) {
  const url = loop.url || `https://www.youtube.com/watch?v=${loop.videoId}`;
  const section = `*${formatTimestamp(loop.start)}-${formatTimestamp(loop.end)}`;
  const outputTemplate = outputPath.replace(/\.(mp3|mp4)$/i, ".%(ext)s");
  const args =
    media === "video"
      ? [
          "--no-playlist",
          "-f",
          "bv*+ba/best",
          "--download-sections",
          section,
          "--force-keyframes-at-cuts",
          "--merge-output-format",
          "mp4",
          "-o",
          outputTemplate,
          url
        ]
      : [
          "--no-playlist",
          "-f",
          "bestaudio*/bestaudio/best",
          "--download-sections",
          section,
          "--force-keyframes-at-cuts",
          "-x",
          "--audio-format",
          "mp3",
          "--audio-quality",
          "0",
          "-o",
          outputTemplate,
          url
        ];
  await run("yt-dlp", args);

  if (!existsSync(outputPath)) {
    throw new Error(`yt-dlp did not create ${outputPath}.`);
  }
}

async function cutLoopMedia(sourcePath, outputPath, loop, media) {
  const duration = Math.max(0.1, loop.end - loop.start);
  const args =
    media === "video"
      ? [
          "-y",
          "-ss",
          String(loop.start),
          "-i",
          sourcePath,
          "-t",
          String(duration),
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          outputPath
        ]
      : [
          "-y",
          "-ss",
          String(loop.start),
          "-i",
          sourcePath,
          "-t",
          String(duration),
          "-vn",
          "-ac",
          "2",
          "-ar",
          "44100",
          "-b:a",
          "128k",
          outputPath
        ];
  await run("ffmpeg", args);
}

function findDownloadedFile(expectedPath, targetDir, videoId) {
  if (existsSync(expectedPath)) return expectedPath;

  const expectedBase = basename(expectedPath, extname(expectedPath));
  throw new Error(`yt-dlp did not create ${expectedBase} in ${targetDir} for ${videoId}.`);
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${command} exited with code ${code}.`));
      }
    });
  });
}

function safeFilename(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function formatTimestamp(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(wholeSeconds)}.${String(milliseconds).padStart(3, "0")}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toCsvRow(values) {
  return values.map(csvCell).join(",");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
