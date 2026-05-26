import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
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

if (!args.skipMedia) {
  if (args.cacheSource) {
    for (const loop of loops) {
      const sourcePath = await ensureSourceMedia(loop, cacheDir, args.media);
      await cutLoopMedia(sourcePath, mediaPathForLoop(loop, mediaDir, args.media), loop, args.media);
    }
  } else {
    await downloadLoopSectionsByVideo(loops, mediaDir, args.media);
  }
}

for (const loop of loops) {
  const mediaFile = args.media === "video" ? `${safeFilename(loop.id)}.mp4` : `${safeFilename(loop.id)}.mp3`;

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

async function downloadLoopSectionsByVideo(loopsToDownload, outputDir, media) {
  const groups = groupLoopsByVideo(loopsToDownload);
  for (const group of groups) {
    await downloadLoopSectionGroup(group, outputDir, media);
  }
}

async function downloadLoopSectionGroup(group, outputDir, media) {
  const tempDir = join(outputDir, `.tmp-${safeFilename(group.videoId)}-${Date.now().toString(36)}`);
  await mkdir(tempDir, { recursive: true });

  const extension = media === "video" ? "mp4" : "mp3";
  const outputTemplate = join(tempDir, "section-%(section_start)s-%(section_end)s.%(ext)s");
  const args =
    media === "video"
      ? [
          "--no-playlist",
          "-f",
          "bv*+ba/best",
          "--force-keyframes-at-cuts",
          "--merge-output-format",
          "mp4",
          "-o",
          outputTemplate,
          group.url
        ]
      : [
          "--no-playlist",
          "-f",
          "bestaudio*/bestaudio/best",
          "--force-keyframes-at-cuts",
          "-x",
          "--audio-format",
          "mp3",
          "--audio-quality",
          "0",
          "-o",
          outputTemplate,
          group.url
        ];

  for (const loop of group.loops) {
    args.splice(args.indexOf("--force-keyframes-at-cuts"), 0, "--download-sections", `*${formatTimestamp(loop.start)}-${formatTimestamp(loop.end)}`);
  }

  await run("yt-dlp", args);

  try {
    await moveSectionOutputs(group.loops, tempDir, outputDir, extension);
  } catch (error) {
    console.warn(`Batch section mapping failed for ${group.videoId}. Falling back to individual downloads.`, error);
    for (const loop of group.loops) {
      await downloadLoopSectionSingle(loop, outputDir, media);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function downloadLoopSectionSingle(loop, outputDir, media) {
  const tempDir = join(outputDir, `.tmp-${safeFilename(loop.id)}-${Date.now().toString(36)}`);
  await mkdir(tempDir, { recursive: true });

  const extension = media === "video" ? "mp4" : "mp3";
  const outputTemplate = join(tempDir, "section-%(section_start)s-%(section_end)s.%(ext)s");
  const url = loop.url || `https://www.youtube.com/watch?v=${loop.videoId}`;
  const args =
    media === "video"
      ? [
          "--no-playlist",
          "-f",
          "bv*+ba/best",
          "--download-sections",
          `*${formatTimestamp(loop.start)}-${formatTimestamp(loop.end)}`,
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
          `*${formatTimestamp(loop.start)}-${formatTimestamp(loop.end)}`,
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

  try {
    await moveSectionOutputs([loop], tempDir, outputDir, extension);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
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

function mediaPathForLoop(loop, outputDir, media) {
  return join(outputDir, `${safeFilename(loop.id)}.${media === "video" ? "mp4" : "mp3"}`);
}

function groupLoopsByVideo(items) {
  const groups = new Map();
  for (const loop of items) {
    const key = loop.videoId;
    const current =
      groups.get(key) ??
      {
        videoId: loop.videoId,
        url: loop.url || `https://www.youtube.com/watch?v=${loop.videoId}`,
        loops: []
      };
    current.loops.push(loop);
    groups.set(key, current);
  }

  return [...groups.values()];
}

async function moveSectionOutputs(loopsToMap, tempDir, outputDir, extension) {
  const files = (await readdir(tempDir)).filter((file) => file.toLowerCase().endsWith(`.${extension}`));
  const remaining = new Set(files);

  for (const loop of loopsToMap) {
    const source = findSectionFileForLoop([...remaining], loop, extension);
    if (!source) {
      throw new Error(`No section file found for ${loop.id} (${loop.start}-${loop.end}).`);
    }

    remaining.delete(source);
    const from = join(tempDir, source);
    const to = join(outputDir, `${safeFilename(loop.id)}.${extension}`);
    if (existsSync(to)) {
      await rm(to, { force: true });
    }
    try {
      await rename(from, to);
    } catch {
      await copyFile(from, to);
      await rm(from, { force: true });
    }
  }
}

function findSectionFileForLoop(files, loop, extension) {
  const expectedStart = formatSectionNumber(loop.start);
  const expectedEnd = formatSectionNumber(loop.end);
  return (
    files.find((file) => file === `section-${expectedStart}-${expectedEnd}.${extension}`) ??
    files.find((file) => file.includes(`-${expectedStart}-${expectedEnd}.`) && file.endsWith(`.${extension}`)) ??
    files.find((file) => {
      const match = /^section-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\./.exec(file);
      if (!match) return false;

      return Math.abs(Number(match[1]) - loop.start) < 0.05 && Math.abs(Number(match[2]) - loop.end) < 0.05;
    })
  );
}

function formatSectionNumber(value) {
  return Number.isInteger(value) ? `${value}.0` : String(value);
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
