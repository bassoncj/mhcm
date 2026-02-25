import { signal } from "@preact/signals";
import type { MHPlayerIdentity, MHActiveMap } from "@mhcm/shared";

export const playerIdentity = signal<MHPlayerIdentity | null>(null);
export const sbBalance = signal<number | null>(null);
export const activeMaps = signal<MHActiveMap[]>([]);

/** Player's MH title/rank ID (extracted from game API responses). Higher = higher rank. */
export const playerTitleId = signal<number | null>(null);

/** The real (non-overridden) rank – used to restore playerTitleId when admin clears override. */
export const realPlayerTitleId = signal<number | null>(null);

/** Player's MH title/rank name (extracted from game API responses). */
export const playerTitleName = signal<string | null>(null);

/** Available SB for placing buy orders (total SB − committed across all marketplaces). */
export const availableSb = signal<number | null>(null);
