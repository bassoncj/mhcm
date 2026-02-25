import { signal } from "@preact/signals";
import type { NotificationPrefs } from "@mhcm/shared";
import { DEFAULT_NOTIFICATION_PREFS } from "@mhcm/shared";

/** Current notification preferences (synced from server). */
export const notificationPrefs = signal<NotificationPrefs>({ ...DEFAULT_NOTIFICATION_PREFS });

/** Update notification preferences from server response. */
export function setNotificationPrefs(prefs: Partial<NotificationPrefs>): void {
  notificationPrefs.value = { ...DEFAULT_NOTIFICATION_PREFS, ...prefs };
}
