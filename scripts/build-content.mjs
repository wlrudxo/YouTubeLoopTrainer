import { build } from "esbuild";

await build({
  entryPoints: ["src/content/index.ts"],
  bundle: true,
  outfile: "dist/content/index.js",
  format: "iife",
  target: "es2020",
  sourcemap: true
});

await build({
  entryPoints: ["src/background/index.ts"],
  bundle: true,
  outfile: "dist/background/index.js",
  format: "esm",
  target: "es2020",
  sourcemap: true
});
