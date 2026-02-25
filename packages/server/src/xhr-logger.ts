import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config.js";

/** Derive the xhr log directory from the DB path (sibling to marketplace.db). */
const xhrDir = resolve(dirname(config.dbPath), "xhr");

export function writeXhrLog(
  userId: number,
  entry: {
    source: "api_call" | "xhr_intercept";
    url: string;
    requestBody?: Record<string, string>;
    responseData: any;
    timestamp: string;
  }
): void {
  try {
    const userDir = resolve(xhrDir, String(userId));
    mkdirSync(userDir, { recursive: true });

    // Filename: timestamp_source.json  (e.g. 2026-02-06T12-30-45-123Z_api_call.json)
    const safeTs = entry.timestamp.replace(/[:.]/g, "-");
    const filename = `${safeTs}_${entry.source}.json`;

    writeFileSync(
      resolve(userDir, filename),
      JSON.stringify(entry, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.warn("[xhr-logger] failed to write log:", err);
  }
}
