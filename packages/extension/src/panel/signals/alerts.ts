import { signal } from "@preact/signals";
import type { ActiveAlert, AdminAlert } from "@mhcm/shared";

/** User-facing: current alert to display (null = no overlay). */
export const activeAlert = signal<ActiveAlert | null>(null);

/** User-facing: version outdated info (null = not outdated). */
export const versionOutdated = signal<{ serverVersion: string; extensionVersion: string } | null>(null);

/** Admin-facing: all alerts for management. */
export const adminAlerts = signal<AdminAlert[]>([]);

/** Admin-facing: whether version mismatch alerts are enabled. */
export const versionAlertEnabled = signal(false);
