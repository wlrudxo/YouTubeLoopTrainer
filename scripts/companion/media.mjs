import { spawn } from "node:child_process";
import { mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { getItem, updateProcessing } from "./storage.mjs";

const activeJobs = new Map();

export function enqueueMediaProcessing(dataDir, videoId, loopId, options = {}) {
  const key = `${videoId}:${loopId}`;
  const existing = activeJobs.get(key);
  if (existing) return existing;

  const job = processItemMedia(dataDir, videoId, loopId, options);
  activeJobs.set(key, job);
  const cleanup = () => {
    if (activeJobs.get(key) === job) activeJobs.delete(key);
  };
  void job.then(cleanup, cleanup);
  return job;
}

export async function processItemMedia(dataDir, videoId, loopId, options = {}) {
  const item = await getItem(dataDir, videoId, loopId);
  if (!item) throw new Error("Item not found.");

  const attempts = (item.processing?.attempts ?? 0) + 1;
  await updateProcessing(dataDir, videoId, loopId, { status: "processing", error: null, attempts });
  const tempDir = await mkdtemp(join(dataDir, "tmp", `${loopId}-`));

  try {
    const downloader = options.downloadSection ?? downloadAudioSection;
    const downloadedPath = await downloader({
      url: item.sourceUrl,
      start: item.start,
      end: item.end,
      outputDir: tempDir
    });
    const finalPath = join(dataDir, "videos", videoId, "loops", loopId, "audio.mp3");
    await rename(downloadedPath, finalPath);
    return await updateProcessing(dataDir, videoId, loopId, { status: "complete", error: null, attempts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateProcessing(dataDir, videoId, loopId, { status: "error", error: message.slice(0, 2000), attempts });
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function downloadAudioSection({ url, start, end, outputDir }) {
  const outputTemplate = join(outputDir, "audio.%(ext)s");
  const args = buildYtDlpAudioArgs({ url, start, end, outputTemplate });
  await runCommand("yt-dlp", args);
  const files = await readdir(outputDir);
  const mp3 = files.find((file) => file.toLowerCase().endsWith(".mp3"));
  if (!mp3) throw new Error("yt-dlp completed without creating an MP3 file.");
  return join(outputDir, mp3);
}

export function buildYtDlpAudioArgs({ url, start, end, outputTemplate }) {
  return [
    "--no-playlist",
    "-f",
    "bestaudio*/bestaudio/best",
    "--download-sections",
    `*${formatTimestamp(start)}-${formatTimestamp(end)}`,
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
}

function runCommand(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: "ignore", shell: false, windowsHide: true });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited with code ${code}.`));
    });
  });
}

function formatTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return [hours, minutes, wholeSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":") + `.${String(millis).padStart(3, "0")}`;
}
