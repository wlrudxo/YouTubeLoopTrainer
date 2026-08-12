import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  base: "",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        popup: resolve(__dirname, "src/popup/index.html"),
        settings: resolve(__dirname, "src/settings/index.html")
      },
      output: {
        entryFileNames: "popup/[name].js",
        chunkFileNames: "popup/[name]-[hash].js",
        assetFileNames: "popup/[name][extname]"
      }
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"]
  }
});
