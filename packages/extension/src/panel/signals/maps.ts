import { signal } from "@preact/signals";
import type {
  MapType,
  MapOrder,
  MapOrderBookSnapshot,
  MapTransaction,
  MapHomeData,
  MapOrderHistoryGroup,
  MapMarketStats,
  MapOrderMode,
} from "@mhcm/shared";

export const selectedMapTypeId = signal<number | null>(null);
export const selectedMapMode = signal<MapOrderMode>("unopened");
export const selectedMapInfo = signal<{
  id: number;
  display_name: string;
  thumbnail: string | null;
  quality?: "common" | "rare";
  goal?: "mouse" | "item";
} | null>(null);

/** All map types for the selector list (fetched once on tab open). */
export const allMapTypes = signal<MapType[]>([]);

/** Current search query in the map selector. */
export const mapSelectorSearch = signal("");

/** Sort mode for the map selector. */
export const mapSelectorSort = signal<"activity" | "name" | "price">("activity");

export const mapOrderBook = signal<MapOrderBookSnapshot | null>(null);
export const mapMarketStats = signal<MapMarketStats | null>(null);

/** Computed tier from server for sell completed mode (null = not yet computed). */
export const sellMapTier = signal<"S" | "A" | "B" | null>(null);
export const sellMapTierLoading = signal(false);

export const myMapOrders = signal<MapOrder[]>([]);
export const activeMapTransaction = signal<MapTransaction | null>(null);

export const mapHomeData = signal<MapHomeData | null>(null);

/** Set of favourite map type IDs for current mode. */
export const mapFavourites = signal<Set<number>>(new Set());

/** Set of notification keys ("mapTypeId:mode") for map marketplace alerts. */
export const mapNotifications = signal<Set<string>>(new Set());

export const mapHistory = signal<MapOrderHistoryGroup[]>([]);
export const mapHistoryPage = signal(1);
export const mapHistoryTotalPages = signal(1);
export const mapHistoryTotalOrders = signal(0);

