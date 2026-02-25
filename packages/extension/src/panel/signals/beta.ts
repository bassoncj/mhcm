import { signal } from "@preact/signals";

/** Which markets are currently in beta mode. */
export const marketBetaConfig = signal<{
  slots: boolean;
  sniping: boolean;
  items: boolean;
  maps: boolean;
}>({
  slots: false,
  sniping: false,
  items: false,
  maps: false,
});

/** Whether the current user is an approved beta tester. */
export const isBetaTester = signal(false);

/** Whether the current user has a pending beta request. */
export const hasPendingBetaRequest = signal(false);
