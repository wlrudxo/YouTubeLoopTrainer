import { createServer } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getItem, importCapture, initializeDataRoot, InputError, listItems, patchItem } from "./storage.mjs";
import { enqueueMediaProcessing } from "./media.mjs";

const MAX_BODY_BYTES = 128 * 1024;

export async function createCompanionServer(options = {}) {
  const dataDir = resolve(options.dataDir ?? resolveDataDir(process.argv.slice(2)));
  const initialized = await initializeDataRoot(dataDir, options.port ?? 17311);
  const config = initialized.config;
  const enqueueMedia = options.enqueueMediaProcessing ?? enqueueMediaProcessing;

  const server = createServer(async (request, response) => {
    try {
      applySecurityHeaders(response);
      if (!handleCors(request, response, config)) return;
      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }

      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { app: "PhraseLoop Companion", version: 1, dataDir });
        return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        sendHtml(response, 200, statusPage());
        return;
      }

      requireToken(request, config.token);

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

function handleCors(request, response, config) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host ?? "";
  const sameOrigin = origin === `http://${host}`;
  if (!sameOrigin && !config.allowedOrigins.includes(origin)) {
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
  if (request.headers.authorization !== `Bearer ${token}`) throw new AuthError(401, "Invalid companion token.");
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

function sendHtml(response, status, html) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function statusPage() {
  return "<!doctype html><meta charset=utf-8><title>PhraseLoop Companion</title><main><h1>PhraseLoop Companion</h1><p>The local service is running.</p></main>";
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
