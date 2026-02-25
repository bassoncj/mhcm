import { signal } from "@preact/signals";
import type {
  ItemType,
  ItemOrder,
  ItemOrderBookSnapshot,
  ItemTransaction,
  ItemHomeData,
  ItemOrderHistoryGroup,
  ItemMarketStats,
} from "@mhcm/shared";

export const selectedItemTypeId = signal<number | null>(null);
export const selectedItemInfo = signal<{ id: number; type: string; name: string; thumbnail: string | null } | null>(null);

/** All item types for the selector list (fetched once on tab open). */
export const allItemTypes = signal<ItemType[]>([]);

/** Current search query in the item selector. */
export const itemSelectorSearch = signal("");

/** Sort mode for the item selector. */
export const itemSelectorSort = signal<"activity" | "name" | "price">("activity");

/** Active classification filters (empty = show all). */
export const selectedClassifications = signal<Set<string>>(new Set());

/** Available classifications (auto-discovered from item types). */
export const itemClassifications = signal<string[]>([]);

export const itemOrderBook = signal<ItemOrderBookSnapshot | null>(null);
export const itemMarketStats = signal<ItemMarketStats | null>(null);

export const myItemOrders = signal<ItemOrder[]>([]);
export const activeItemTransaction = signal<ItemTransaction | null>(null);

export const itemHomeData = signal<ItemHomeData | null>(null);

export const itemFavourites = signal<Set<number>>(new Set());
export const itemNotifications = signal<Set<number>>(new Set());

export const itemHistory = signal<ItemOrderHistoryGroup[]>([]);
export const itemHistoryPage = signal(1);
export const itemHistoryTotalPages = signal(1);
