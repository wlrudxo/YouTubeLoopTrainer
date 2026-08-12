import { createServer } from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { allowOrigin, getItem, importCapture, initializeDataRoot, InputError, listItems, patchItem } from "./storage.mjs";
import { enqueueMediaProcessing } from "./media.mjs";
import { syncItemToAnki } from "./anki.mjs";

const MAX_BODY_BYTES = 128 * 1024;

export async function createCompanionServer(options = {}) {
  const dataDir = resolve(options.dataDir ?? resolveDataDir(process.argv.slice(2)));
  const initialized = await initializeDataRoot(dataDir, options.port ?? 17311);
  const config = initialized.config;
  const enqueueMedia = options.enqueueMediaProcessing ?? enqueueMediaProcessing;

  const server = createServer(async (request, response) => {
    try {
      applySecurityHeaders(response);
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      if (!handleCors(request, response, config, url.pathname)) return;
      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { app: "PhraseLoop Companion", version: 1, dataDir });
        return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        response.setHeader("Set-Cookie", `phraseloop_token=${config.token}; HttpOnly; SameSite=Strict; Path=/`);
        await sendWebFile(response, "index.html");
        return;
      }
      if (request.method === "GET" && url.pathname === "/app.js") {
        await sendWebFile(response, "app.js");
        return;
      }
      if (request.method === "GET" && url.pathname === "/styles.css") {
        await sendWebFile(response, "styles.css");
        return;
      }

      requireToken(request, config.token);

      if (request.method === "POST" && url.pathname === "/pair") {
        const origin = request.headers.origin;
        if (!origin) throw new InputError("Pairing requires a browser extension origin.");
        await allowOrigin(dataDir, config, origin);
        response.setHeader("Access-Control-Allow-Origin", origin);
        sendJson(response, 200, { paired: true });
        return;
      }

      if (request.method === "POST" && url.pathname === "/import") {
        const result = await importCapture(dataDir, await readJsonBody(request));
        if (result.changed || result.item.processing?.status === "error") {
          void enqueueMedia(dataDir, result.item.videoId, result.item.loopId).catch((error) => {
            console.error(`Media processing failed for ${result.item.loopId}:`, error.message);
          });
        }
        sendJson(response, result.created ? 201 : 200, {
          loopId: result.item.loopId,
          videoId: result.item.videoId,
          captureHash: result.item.captureHash,
          processing: result.item.processing,
          created: result.created,
          changed: result.changed
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/items") {
        sendJson(response, 200, { items: await listItems(dataDir) });
        return;
      }

      const itemMatch = /^\/api\/items\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})$/.exec(url.pathname);
      if (request.method === "GET" && itemMatch) {
        const item = await getItem(dataDir, itemMatch[1], itemMatch[2]);
        if (!item) {
          sendJson(response, 404, { error: "Item not found." });
          return;
        }
        sendJson(response, 200, item);
        return;
      }

      const mediaMatch = /^\/media\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/audio\.mp3$/.exec(url.pathname);
      if (request.method === "GET" && mediaMatch) {
        const audioPath = join(dataDir, "videos", mediaMatch[1], "loops", mediaMatch[2], "audio.mp3");
        try {
          const audio = await readFile(audioPath);
          response.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
          response.end(audio);
        } catch (error) {
          if (error?.code === "ENOENT") sendJson(response, 404, { error: "Audio not found." });
          else throw error;
        }
        return;
      }

      const processMatch = /^\/api\/items\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/process$/.exec(url.pathname);
      if (request.method === "POST" && processMatch) {
        const item = await getItem(dataDir, processMatch[1], processMatch[2]);
        if (!item) {
          sendJson(response, 404, { error: "Item not found." });
          return;
        }
        void enqueueMedia(dataDir, processMatch[1], processMatch[2]).catch((error) => {
          console.error(`Media processing failed for ${processMatch[2]}:`, error.message);
        });
        sendJson(response, 202, { processing: "queued" });
        return;
      }

      const ankiMatch = /^\/api\/items\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/anki$/.exec(url.pathname);
      if (request.method === "POST" && ankiMatch) {
        const result = await syncItemToAnki(dataDir, ankiMatch[1], ankiMatch[2], config);
        sendJson(response, 200, { noteId: result.noteId, created: result.created, anki: result.item.anki });
        return;
      }
      if (request.method === "PATCH" && itemMatch) {
        const item = await patchItem(dataDir, itemMatch[1], itemMatch[2], await readJsonBody(request));
        if (!item) {
          sendJson(response, 404, { error: "Item not found." });
          return;
        }
        sendJson(response, 200, item);
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      if (error instanceof InputError) {
        sendJson(response, 400, { error: error.message });
      } else if (error instanceof AuthError) {
        sendJson(response, error.status, { error: error.message });
      } else {
        console.error(error);
        sendJson(response, 500, { error: "Internal server error." });
      }
    }
  });

  return { server, dataDir, config, initialized };
}

export async function startCompanion(options = {}) {
  const companion = await createCompanionServer(options);
  const port = options.port ?? companion.config.port;
  await new Promise((resolveListen, rejectListen) => {
    companion.server.once("error", rejectListen);
    companion.server.listen(port, "127.0.0.1", resolveListen);
  });
  const address = companion.server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`PhraseLoop Companion: http://127.0.0.1:${actualPort}`);
  console.log(`Data: ${companion.dataDir}`);
  console.log(`Config: ${companion.initialized.configPath}`);
  if (companion.initialized.created) console.log(`Token: ${companion.config.token}`);
  return companion;
}

function resolveDataDir(args) {
  const index = args.indexOf("--data-dir");
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return process.env.PHRASELOOP_DATA_DIR || resolve(homedir(), "PhraseLoopData");
}

function handleCors(request, response, config, pathname) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host ?? "";
  const sameOrigin = origin === `http://${host}`;
  const pairing = pathname === "/pair" && origin.startsWith("chrome-extension://");
  if (!sameOrigin && !pairing && !config.allowedOrigins.includes(origin)) {
    sendJson(response, 403, { error: "Origin is not allowed." });
    return false;
  }
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  return true;
}

function requireToken(request, token) {
  const cookie = request.headers.cookie ?? "";
  const cookieToken = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("phraseloop_token="))?.slice("phraseloop_token=".length);
  if (request.headers.authorization !== `Bearer ${token}` && cookieToken !== token) {
    throw new AuthError(401, "Invalid companion token.");
  }
}

async function readJsonBody(request) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new InputError("Content-Type must be application/json.");
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new InputError("Request body is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("Request body must be valid JSON.");
  }
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'");
}

function sendJson(response, status, value) {
  if (response.headersSent) return;
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(value)}\n`);
}

async function sendWebFile(response, filename) {
  const path = join(resolve(fileURLToPath(new URL(".", import.meta.url))), "web", filename);
  const content = await readFile(path);
  const contentType = filename.endsWith(".html")
    ? "text/html; charset=utf-8"
    : filename.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "text/javascript; charset=utf-8";
  response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  response.end(content);
}

class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  startCompanion().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
