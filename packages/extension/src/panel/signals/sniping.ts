import { signal } from "@preact/signals";
import type {
  GoalType,
  SnipingOrder,
  SnipingOrderBookSnapshot,
  SnipingTransaction,
  SnipingTarget,
  MouseType,
  ItemType,
  SnipingHomeData,
  SnipingWizardMouse,
  SnipingWizardGroup,
  SnipingItemWizardItem,
  SnipingItemWizardGroup,
  SnipingMapHistoryGroup,
} from "@mhcm/shared";

/** Active goal mode for the sniping UI: mice or items subtab. */
export const snipingGoalMode = signal<GoalType>("mouse");

export const selectedMouseTypeId = signal<number | null>(null);
export const selectedMouseGroupId = signal<number | null>(null);
/** Display info for the currently selected mouse or group. */
export const selectedMouseInfo = signal<{ id: number; name: string; thumbnail: string | null; isGroup?: boolean } | null>(null);

export const selectedItemTypeId = signal<number | null>(null);
export const selectedItemGroupId = signal<number | null>(null);
/** Display info for the currently selected item or item group. */
export const selectedItemInfo = signal<{ id: number; name: string; thumbnail: string | null; isGroup?: boolean } | null>(null);

export const snipingOrderBook = signal<SnipingOrderBookSnapshot | null>(null);
export const mySnipingOrders = signal<SnipingOrder[]>([]);
export const activeSnipingTransactions = signal<SnipingTransaction[]>([]);
export const mouseSearchResults = signal<MouseType[]>([]);
export const itemSearchResults = signal<ItemType[]>([]);
export const snipingError = signal<string | null>(null);
/** Recently failed sniping transactions – shown briefly in the UI. */
export const recentlyFailedSnipingTxns = signal<SnipingTransaction[]>([]);

// Home + favourites + paginated list + wizard
export const snipingHomeData = signal<SnipingHomeData | null>(null);
export const snipingFavourites = signal<SnipingTarget[]>([]);
export const mouseListPage = signal<{ mice: MouseType[]; hasMore: boolean } | null>(null);
export const itemListPage = signal<{ items: ItemType[]; hasMore: boolean } | null>(null);
export const snipingWizardData = signal<{ mice: SnipingWizardMouse[]; groups: SnipingWizardGroup[] } | null>(null);
export const snipingItemWizardData = signal<{ items: SnipingItemWizardItem[]; groups: SnipingItemWizardGroup[] } | null>(null);

// Sniping transaction history
export const snipingHistory = signal<SnipingMapHistoryGroup[]>([]);
export const snipingHistoryPage = signal(1);
export const snipingHistoryTotalPages = signal(1);
export const snipingHistoryTotalMaps = signal(0);

/** Active payment grace penalties (insufficient SB) – shown as persistent banner. */
export const snipingPaymentPenalties = signal<Array<{ transactionId: number; requiredAmount: number; reportedBalance: number; graceExpiresAt: string }>>([]);
