import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const rewind = process.argv.includes("--rewind");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function bumpPatch(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function rewindPatch(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (patch <= 0) {
    console.error(`[bump-version] Cannot rewind ${version} — patch is already 0`);
    process.exit(1);
  }
  return `${major}.${minor}.${patch - 1}`;
}

// Read current version from the server package.json (source of truth)
const serverPkg = readJson(resolve(root, "packages/server/package.json"));
const oldVersion = serverPkg.version;
const newVersion = rewind ? rewindPatch(oldVersion) : bumpPatch(oldVersion);

// Files to update
const files = [
  "packages/shared/package.json",
  "packages/server/package.json",
  "packages/extension/package.json",
  "packages/extension/src/manifest.chrome.json",
  "packages/extension/src/manifest.firefox.json",
];

for (const file of files) {
  const fullPath = resolve(root, file);
  const data = readJson(fullPath);
  data.version = newVersion;
  writeJson(fullPath, data);
}

const arrow = rewind ? "←" : "→";
console.log(`[bump-version] ${oldVersion} ${arrow} ${newVersion}`);
