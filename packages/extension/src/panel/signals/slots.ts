import { signal } from "@preact/signals";
import type { SlotOrder, SlotOrderBookSnapshot, SlotTransaction, SlotOrderHistoryGroup, MapType, MapTypeStats, HomeData, OrderTier } from "@mhcm/shared";

export const mapTypes = signal<MapType[]>([]);
export const mapTypeStats = signal<Record<string, MapTypeStats>>({});
export const selectedMapTypeId = signal<number | null>(null);
export const orderBook = signal<SlotOrderBookSnapshot | null>(null);
export const myOrders = signal<SlotOrder[]>([]);
export const ordersLoading = signal(false);
export const orderError = signal<string | null>(null);
export const showDisabledMaps = signal(false);

/** Tier filter for order book sell display. Set of tiers to show; empty = show all. */
export const tierFilter = signal<Set<OrderTier>>(new Set());

/** RT filter for order book display. "off" = hide RT, "only" = RT only, "all" = show everything. */
export type RtFilterMode = "off" | "only" | "all";
export const rtFilter = signal<RtFilterMode>("off");

export const transactions = signal<SlotTransaction[]>([]);
export const activeTransaction = signal<SlotTransaction | null>(null);
export const transactionHistory = signal<SlotOrderHistoryGroup[]>([]);

/** Transaction history pagination state. */
export const historyPage = signal(1);
export const historyTotalPages = signal(1);
export const historyTotalOrders = signal(0);

export const homeData = signal<HomeData | null>(null);
export const favouriteMapTypeIds = signal<number[]>([]);
export const subscribedMapTypeIds = signal<number[]>([]);
