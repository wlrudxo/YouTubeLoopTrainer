import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCompanionServer } from "./server.mjs";

const running = [];
const tempDirs = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function startTestServer() {
  const dataDir = await mkdtemp(join(tmpdir(), "phraseloop-server-"));
  tempDirs.push(dataDir);
  const companion = await createCompanionServer({
    dataDir,
    port: 17311,
    enqueueMediaProcessing: async () => undefined
  });
  await new Promise((resolve, reject) => {
    companion.server.once("error", reject);
    companion.server.listen(0, "127.0.0.1", resolve);
  });
  running.push(companion.server);
  const address = companion.server.address();
  return { ...companion, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("companion HTTP server", () => {
  it("exposes health without revealing the token", async () => {
    const companion = await startTestServer();
    const response = await fetch(`${companion.baseUrl}/health`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.app).toBe("PhraseLoop Companion");
    expect(JSON.stringify(body)).not.toContain(companion.config.token);
  });

  it("serves the local app and authenticates its same-site cookie", async () => {
    const companion = await startTestServer();
    const page = await fetch(`${companion.baseUrl}/`);
    const cookie = page.headers.get("set-cookie");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("PhraseLoop Dictation");
    expect(cookie).toContain("HttpOnly");

    const items = await fetch(`${companion.baseUrl}/api/items`, { headers: { Cookie: cookie.split(";")[0] } });
    expect(items.status).toBe(200);
  });

  it("requires a token for imports and returns a capture hash", async () => {
    const companion = await startTestServer();
    const payload = {
      loopId: "lp_http",
      videoId: "video_http",
      start: 1,
      end: 3,
      label: "hello there",
      title: "Test",
      url: "https://www.youtube.com/watch?v=video_http"
    };
    const denied = await fetch(`${companion.baseUrl}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(denied.status).toBe(401);

    const accepted = await fetch(`${companion.baseUrl}/import`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${companion.config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await accepted.json();
    expect(accepted.status).toBe(201);
    expect(body.captureHash).toMatch(/^sha256:/);
    expect(body.processing.status).toBe("queued");
  });

  it("rejects unapproved browser origins", async () => {
    const companion = await startTestServer();
    const response = await fetch(`${companion.baseUrl}/api/items`, {
      headers: {
        Authorization: `Bearer ${companion.config.token}`,
        Origin: "https://evil.example"
      }
    });
    expect(response.status).toBe(403);
  });

  it("pairs an authenticated Chrome extension origin", async () => {
    const companion = await startTestServer();
    const origin = "chrome-extension://abcdefghijklmnop";
    const response = await fetch(`${companion.baseUrl}/pair`, {
      method: "POST",
      headers: { Authorization: `Bearer ${companion.config.token}`, Origin: origin, "Content-Type": "application/json" }
    });
    expect(response.status).toBe(200);
    expect(companion.config.allowedOrigins).toContain(origin);

    const allowed = await fetch(`${companion.baseUrl}/api/items`, {
      headers: { Authorization: `Bearer ${companion.config.token}`, Origin: origin }
    });
    expect(allowed.status).toBe(200);
  });
});
