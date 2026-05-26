import { copyFile, mkdir, rm } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await mkdir("dist/content", { recursive: true });
await mkdir("dist/library", { recursive: true });
await mkdir("dist/popup", { recursive: true });
await mkdir("dist/settings", { recursive: true });
await copyFile("public/manifest.json", "dist/manifest.json");
await copyFile("src/content/content.css", "dist/content/content.css");
await copyFile("dist/src/library/index.html", "dist/library/index.html");
await copyFile("dist/src/popup/index.html", "dist/popup/index.html");
await copyFile("dist/src/settings/index.html", "dist/settings/index.html");
await rm("dist/src", { recursive: true, force: true });
