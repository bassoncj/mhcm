import { getDb } from "../connection.js";

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

/** Get a setting value by key. Returns null if not found. */
export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as SettingRow | undefined;
  return row?.value ?? null;
}

/** Get a boolean setting. Returns the default if not found. */
export function getBoolSetting(key: string, defaultValue: boolean): boolean {
  const value = getSetting(key);
  if (value === null) return defaultValue;
  return value === "true" || value === "1";
}

/** Set a setting value. Creates or updates the setting. */
export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value);
}

/** Set a boolean setting. */
export function setBoolSetting(key: string, value: boolean): void {
  setSetting(key, value ? "true" : "false");
}

/** Get an integer setting. Returns the default if not found or non-numeric. */
export function getIntSetting(key: string, defaultValue: number): number {
  const value = getSetting(key);
  if (value === null) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

/** Set an integer setting. */
export function setIntSetting(key: string, value: number): void {
  setSetting(key, String(value));
}

/** Delete a setting. */
export function deleteSetting(key: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM settings WHERE key = ?")
    .run(key);
  return result.changes > 0;
}
