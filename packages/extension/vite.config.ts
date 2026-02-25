import { defineConfig, build as viteBuild } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readFileSync } from "fs";
import { config } from "dotenv";

// Load .env from monorepo root
config({ path: resolve(__dirname, "../../.env") });

const target = process.env.BUILD_TARGET || "chrome";
const root = resolve(__dirname, "src");
const outDir = resolve(__dirname, "dist", target);

// Build-time constants - REQUIRED in .env
const DEFAULT_SERVER_URL = process.env.DEFAULT_SERVER_URL;
if (!DEFAULT_SERVER_URL) {
  throw new Error("DEFAULT_SERVER_URL must be set in .env");
}

// Read version from package.json for build-time injection
const pkgJson = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));
const MHCM_VERSION = pkgJson.version;

// Define replacements for build-time injection
const defineReplacements = {
  __DEFAULT_SERVER_URL__: JSON.stringify(DEFAULT_SERVER_URL),
  __MHCM_VERSION__: JSON.stringify(MHCM_VERSION),
};

export default defineConfig({
  root,
  define: defineReplacements,
  plugins: [
    preact(),
    {
      name: "copy-manifest",
      writeBundle() {
        const src = resolve(root, `manifest.${target}.json`);
        mkdirSync(outDir, { recursive: true });
        copyFileSync(src, resolve(outDir, "manifest.json"));
      },
    },
    {
      name: "build-content-scripts",
      async closeBundle() {
        // Content scripts cannot use ES module imports in Chrome extensions.
        // Build each separately as IIFE with all dependencies inlined.
        for (const entry of ["content-script", "main-world"]) {
          await viteBuild({
            configFile: false,
            define: defineReplacements,
            build: {
              outDir,
              emptyOutDir: false,
              rollupOptions: {
                input: resolve(root, `content-script/${entry === "content-script" ? "index" : entry}.ts`),
                output: {
                  format: "iife",
                  entryFileNames: `${entry}.js`,
                  inlineDynamicImports: true,
                },
              },
            },
          });
        }
      },
    },
  ],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: resolve(root, "panel/index.html"),
        "options/index": resolve(root, "options/index.html"),
        "service-worker": resolve(root, "service-worker/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
});
