import { useRef, useState } from "preact/hooks";
import type { SlotOrderHistoryGroup, SlotTransactionHistoryLine, SnipingMapHistoryGroup, SnipingMapTransactionLine, ItemOrderHistoryGroup, ItemTransactionLine, MapOrderHistoryGroup, MapTransactionLine, GoalType } from "@mhcm/shared";
import { formatItemPrice, itemSbTotal } from "@mhcm/shared";
import { signal, computed } from "@preact/signals";
import { transactionHistory, historyPage, historyTotalPages } from "../../signals/slots.js";
import { snipingHistory, snipingHistoryPage, snipingHistoryTotalPages } from "../../signals/sniping.js";
import { itemHistory, itemHistoryPage, itemHistoryTotalPages } from "../../signals/items.js";
import { mapHistory, mapHistoryPage, mapHistoryTotalPages, mapHistoryTotalOrders } from "../../signals/maps.js";
import { activeMaps } from "../../signals/game-state.js";
import { openInGameTab, wsSend } from "../../hooks/useServiceWorker.js";
import { IconEllipsis, IconMap, IconCheck, IconX, IconStore, IconHelpCircle, IconPuzzle, IconMouse, IconLootBag, IconDiamond, IconCheckCircle } from "../common/Icons.js";
import { PaginationBar } from "../common/PaginationBar.js";

type HistoryFilter = "all" | "slots" | "sniping" | "items" | "maps";

const expandedOrders = signal<Set<number>>(new Set());
const expandedSnipingOrders = signal<Set<number>>(new Set());
const expandedItemOrders = signal<Set<number>>(new Set());
const expandedMapOrders = signal<Set<number>>(new Set());

function toggleExpand(orderId: number) {
  const next = new Set(expandedOrders.value);
  if (next.has(orderId)) next.delete(orderId);
  else next.add(orderId);
  expandedOrders.value = next;
}

function toggleSnipingExpand(orderId: number) {
  const next = new Set(expandedSnipingOrders.value);
  if (next.has(orderId)) next.delete(orderId);
  else next.add(orderId);
  expandedSnipingOrders.value = next;
}

function toggleItemExpand(orderId: number) {
  const next = new Set(expandedItemOrders.value);
  if (next.has(orderId)) next.delete(orderId);
  else next.add(orderId);
  expandedItemOrders.value = next;
}

function toggleMapExpand(orderId: number) {
  const next = new Set(expandedMapOrders.value);
  if (next.has(orderId)) next.delete(orderId);
  else next.add(orderId);
  expandedMapOrders.value = next;
}

function formatRelative(iso: string): string {
  const d = new Date(iso + "Z");
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDrawerDate(iso: string): string {
  const d = new Date(iso + "Z");
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${day} ${month}`;
}

function getBadge(group: OrderHistoryGroup): { label: string; cls: string } {
  if (group.filledQuantity >= group.quantity) {
    return { label: "completed", cls: "history-badge history-badge-completed" };
  }
  if (group.orderStatus === "cancelled") {
    return { label: "closed", cls: "history-badge history-badge-closed" };
  }
  return { label: "open", cls: "history-badge history-badge-open" };
}

/** Returns a user-facing note or null if the reason is internal noise. */
function getUserFacingReason(reason: string): string | null {
  if (reason.startsWith("Step sniping_")) return null;
  switch (reason) {
    case "server restarted":
    case "server restarted during sniping":
      return null;
    case "sniper_abandoned": return "Sniper abandoned the map";
    case "Sniping phase timed out": return "Sniping timed out";
    default: return null;
  }
}

function resolveMapName(mhMapId: number): string {
  const m = activeMaps.value.find((am) => am.map_id === mhMapId);
  return m ? m.name : `Sniping Job #${mhMapId}`;
}

type HistoryItem =
  | { kind: "slot"; group: OrderHistoryGroup; sortDate: string }
  | { kind: "sniping"; group: SnipingMapHistoryGroup; sortDate: string }
  | { kind: "item"; group: ItemOrderHistoryGroup; sortDate: string }
  | { kind: "map"; group: MapOrderHistoryGroup; sortDate: string };

const mergedHistory = computed<HistoryItem[]>(() => {
  const items: HistoryItem[] = [];

  for (const group of transactionHistory.value) {
    items.push({ kind: "slot", group, sortDate: group.lastActivityAt });
  }

  for (const group of snipingHistory.value) {
    // Skip map groups where all transactions are internal noise.
    if (getVisibleTransactions(group.transactions).length === 0) continue;
    items.push({ kind: "sniping", group, sortDate: group.lastActivityAt });
  }

  for (const group of itemHistory.value) {
    items.push({ kind: "item", group, sortDate: group.lastActivityAt });
  }

  for (const group of mapHistory.value) {
    // Use the first transaction's completedAt as the sortDate
    const sortDate = group.transactions[0]?.completedAt || group.createdAt;
    items.push({ kind: "map", group, sortDate });
  }

  // Sort newest first
  items.sort((a, b) => b.sortDate.localeCompare(a.sortDate));

  return items;
});

const HISTORY_PER_PAGE = 15;

function goToSlotPage(page: number) {
  wsSend({ type: "get_transaction_history", payload: { page, perPage: HISTORY_PER_PAGE } });
}

function goToSnipingPage(page: number) {
  wsSend({ type: "get_sniping_transaction_history", payload: { page, perPage: HISTORY_PER_PAGE } });
}

function goToItemPage(page: number) {
  wsSend({ type: "get_item_transaction_history", payload: { page, perPage: HISTORY_PER_PAGE } });
}

function goToMapPage(page: number) {
  wsSend({ type: "get_map_transaction_history", payload: { page, perPage: HISTORY_PER_PAGE } });
}

function goToAllPage(page: number) {
  goToSlotPage(Math.min(page, historyTotalPages.value));
  goToSnipingPage(Math.min(page, snipingHistoryTotalPages.value));
  goToItemPage(Math.min(page, itemHistoryTotalPages.value));
  goToMapPage(Math.min(page, mapHistoryTotalPages.value));
}

function TransactionDrawerRow({
  line,
  side,
}: {
  line: TransactionHistoryLine;
  side: "sell" | "buy";
}) {
  const profileUrl = `https://www.mousehuntgame.com/profile.php?snuid=${line.counterpartySnUserId}`;
  const priceStr =
    side === "buy"
      ? `-${line.price.toLocaleString()} SB`
      : `${line.price.toLocaleString()} SB`;

  return (
    <div class={`history-drawer-row${line.isRt ? " rt-row" : ""}`}>
      <div class="history-drawer-main">
        <span class="history-drawer-date">{formatDrawerDate(line.completedAt)}</span>
        <span class="history-drawer-sep">&middot;</span>
        <a
          class="history-drawer-link"
          href={profileUrl}
          title={line.counterpartySnUserId}
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            openInGameTab(profileUrl);
          }}
        >
          {line.counterpartySnUserId}
        </a>
        <span class="history-drawer-sep">&middot;</span>
        <span class={`history-drawer-price ${side}`}>
          {priceStr}
          {line.isRt && <span class="rt-star" title="Return Tradables">★</span>}
        </span>
      </div>
      {line.isRt && line.rtItems && line.rtItems.length > 0 && (
        <div class="rt-items-list">
          {line.rtItems.map((item, i) => (
            <div key={i} class="rt-item-row">
              <span class="rt-item-dot">&middot;</span>
              <span class="rt-item-name">{item.name}</span>
              <span class="rt-item-qty">x{item.quantity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderHistoryCard({ group }: { group: OrderHistoryGroup }) {
  const expanded = expandedOrders.value.has(group.orderId);
  const badge = getBadge(group);
  const totalSb = (group.price * group.filledQuantity).toLocaleString();
  const hasRt = group.transactions.some((t) => t.isRt);

  return (
    <div class="history-card">
      <div
        class="history-card-header"
        onClick={() => toggleExpand(group.orderId)}
      >
        <div class="history-card-thumb">
          {group.mapThumbnail ? (
            <img
              class="history-thumb"
              src={group.mapThumbnail}
              alt={group.mapDisplayName}
              width={32}
              height={32}
            />
          ) : (
            <div class="history-thumb-placeholder">
              <IconMap size={20} />
            </div>
          )}
        </div>
        <div class="history-card-info">
          <div class="history-card-title">
            <span class="market-icon-inline wm-slot"><IconPuzzle size={13} /></span>
            {group.mapDisplayName}
          </div>
          <div class="history-card-meta">
            {group.filledQuantity}/{group.quantity} slots &middot; {totalSb} SB
            {hasRt && <span class="rt-star" title="Includes RT transactions">★</span>}
          </div>
          <div class="history-card-date">
            Last sale: {formatRelative(group.lastActivityAt)}
          </div>
        </div>
        <div class="history-card-right">
          <span class={badge.cls}>{badge.label}</span>
          <span class="expand-toggle">
            {expanded ? <IconX size={14} /> : <IconEllipsis size={14} />}
          </span>
        </div>
      </div>
      {expanded && (
        <div class="history-drawer">
          {group.transactions.map((line) => (
            <TransactionDrawerRow
              key={line.id}
              line={line}
              side={group.side}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const MH_MICE_ICON = "https://www.mousehuntgame.com/images/ui/hud/menu/mice.png";

/** Filter out noise-only failed transactions (server restarts, step failures). */
function getVisibleTransactions(txns: SnipingMapTransactionLine[]): SnipingMapTransactionLine[] {
  return txns.filter((t) => {
    if (t.state === "failed" && t.failureReason && !getUserFacingReason(t.failureReason)) return false;
    return true;
  });
}

function getSnipingBadge(group: SnipingMapHistoryGroup): { label: string; cls: string } {
  const visible = getVisibleTransactions(group.transactions);
  const completedCount = visible.filter((t) => t.state === "completed").length;
  const failedCount = visible.length - completedCount;
  if (failedCount === 0 && completedCount > 0) {
    return { label: "completed", cls: "history-badge history-badge-completed" };
  }
  if (completedCount === 0 && failedCount > 0) {
    return { label: "failed", cls: "history-badge history-badge-closed" };
  }
  if (visible.length === 0) {
    return { label: "completed", cls: "history-badge history-badge-completed" };
  }
  return { label: "partial", cls: "history-badge history-badge-open" };
}

/** Flatten all transactions into per-hunter goal lists (mice or items). */
function groupGoalsByHunter(transactions: SnipingMapTransactionLine[], goalType: GoalType) {
  const map = new Map<string, Array<{
    txnId: number;
    goalIdx: number;
    goalName: string;
    goalThumbnail: string | null;
    price: number;
    completed: boolean;
    date: string;
    failureReason?: string;
  }>>();

  for (const txn of transactions) {
    if (txn.state === "failed" && txn.failureReason && !getUserFacingReason(txn.failureReason)) {
      continue;
    }
    const key = txn.counterpartySnUserId;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key)!;

    if (goalType === "item") {
      txn.items.forEach((item, idx) => {
        list.push({
          txnId: txn.id,
          goalIdx: idx,
          goalName: item.itemName,
          goalThumbnail: item.itemThumbnail,
          price: item.price,
          completed: item.found,
          date: item.foundAt || txn.completedAt,
          failureReason: txn.failureReason,
        });
      });
    } else {
      txn.mice.forEach((mouse, idx) => {
        list.push({
          txnId: txn.id,
          goalIdx: idx,
          goalName: mouse.mouseName,
          goalThumbnail: mouse.mouseThumbnail,
          price: mouse.price,
          completed: mouse.caught,
          date: mouse.caughtAt || txn.completedAt,
          failureReason: txn.failureReason,
        });
      });
    }
  }

  return Array.from(map.entries())
    .map(([snUserId, goals]) => ({ snUserId, goals }))
    .filter((h) => h.goals.length > 0);
}

function SnipingHistoryCard({ group }: { group: SnipingMapHistoryGroup }) {
  const expanded = expandedSnipingOrders.value.has(group.mhMapId);
  const badge = getSnipingBadge(group);
  const mapName = resolveMapName(group.mhMapId);

  // Recompute totals from visible transactions only (excludes noise failures).
  const visible = getVisibleTransactions(group.transactions);
  let totalGoals = 0;
  let completedGoals = 0;
  let totalSb = 0;
  for (const t of visible) {
    if (group.goalType === "item") {
      for (const i of t.items) { totalGoals++; if (i.found) completedGoals++; }
    } else {
      for (const m of t.mice) { totalGoals++; if (m.caught) completedGoals++; }
    }
    if (t.state === "completed") totalSb += t.totalPrice;
  }

  return (
    <div class="history-card">
      <div
        class="history-card-header"
        onClick={() => toggleSnipingExpand(group.mhMapId)}
      >
        <div class="history-card-thumb">
          {group.goalType === "item" ? (
            <div class="history-thumb-placeholder">
              <IconStore size={20} />
            </div>
          ) : (
            <img
              class="history-thumb"
              src={MH_MICE_ICON}
              alt={mapName}
              width={32}
              height={32}
            />
          )}
        </div>
        <div class="history-card-info">
          <div class="history-card-title">
            <span class="market-icon-inline wm-sniping">
              {group.goalType === "item" ? <IconLootBag size={13} /> : <IconMouse size={13} />}
            </span>
            {mapName}
          </div>
          <div class="history-card-meta">
            {completedGoals}/{totalGoals} {group.goalType === "item" ? "found" : "caught"} &middot;{" "}
            {totalSb.toLocaleString()} SB &middot;{" "}
            <span class={group.role === "sniper" ? "role-sniper" : "role-maptain"}>
              {group.role === "sniper" ? "Sniper" : "Maptain"}
            </span>
          </div>
          <div class="history-card-date">
            {formatRelative(group.lastActivityAt)}
          </div>
        </div>
        <div class="history-card-right">
          <span class={badge.cls}>{badge.label}</span>
          <span class="expand-toggle">
            {expanded ? <IconX size={14} /> : <IconEllipsis size={14} />}
          </span>
        </div>
      </div>
      {expanded && (
        <div class="history-drawer">
          {groupGoalsByHunter(group.transactions, group.goalType).map((hunter) => {
            const profileUrl = `https://www.mousehuntgame.com/profile.php?snuid=${hunter.snUserId}`;
            return (
              <div key={hunter.snUserId} class="snipe-hunter-group">
                <div class="snipe-hunter-header">
                  <a
                    class="history-drawer-link"
                    href={profileUrl}
                    title={hunter.snUserId}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      openInGameTab(profileUrl);
                    }}
                  >
                    {hunter.snUserId}
                  </a>
                </div>
                {hunter.goals.map((goal) => (
                  <div key={`${goal.txnId}-${goal.goalIdx}`} class="snipe-mouse-row">
                    <span class="snipe-mouse-date">{formatDrawerDate(goal.date)}</span>
                    {goal.goalThumbnail ? (
                      <img class="mouse-thumb-sm" src={goal.goalThumbnail} alt="" />
                    ) : (
                      <span class="mouse-thumb-sm" />
                    )}
                    <span class="snipe-mouse-detail">
                      <span class="snipe-mouse-name">{goal.goalName}</span>
                      <span class={`caught-icon ${goal.completed ? "caught" : "missed"}`}>
                        {goal.completed ? <IconCheck size={12} /> : <IconX size={12} />}
                      </span>
                      {goal.failureReason && getUserFacingReason(goal.failureReason) && (
                        <span class="snipe-note-icon">
                          <IconHelpCircle size={12} />
                          <span class="snipe-note-tooltip">{getUserFacingReason(goal.failureReason)}</span>
                        </span>
                      )}
                    </span>
                    <span class="snipe-mouse-price">{goal.price.toLocaleString()} SB</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemTransactionDrawerRow({
  line,
  side,
}: {
  line: ItemTransactionLine;
  side: "sell" | "buy";
}) {
  const profileUrl = `https://www.mousehuntgame.com/profile.php?snuid=${line.counterpartySnUserId}`;
  const total = itemSbTotal(line.price, line.quantity);
  const priceStr =
    side === "buy"
      ? `-${total.toLocaleString()} SB`
      : `${total.toLocaleString()} SB`;

  return (
    <div class="history-drawer-row">
      <div class="history-drawer-main">
        <span class="history-drawer-date">{formatDrawerDate(line.completedAt)}</span>
        <span class="history-drawer-sep">&middot;</span>
        <a
          class="history-drawer-link"
          href={profileUrl}
          title={line.counterpartySnUserId}
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            openInGameTab(profileUrl);
          }}
        >
          {line.counterpartySnUserId}
        </a>
        <span class="history-drawer-sep">&middot;</span>
        <span class="history-drawer-qty">{line.quantity.toLocaleString()} &times; {formatItemPrice(line.price)}</span>
        <span class="history-drawer-sep">&middot;</span>
        <span class={`history-drawer-price ${side}`}>{priceStr}</span>
      </div>
    </div>
  );
}

function getItemBadge(group: ItemOrderHistoryGroup): { label: string; cls: string } {
  if (group.filledQuantity >= group.quantity) {
    return { label: "completed", cls: "history-badge history-badge-completed" };
  }
  if (group.orderStatus === "cancelled") {
    return { label: "closed", cls: "history-badge history-badge-closed" };
  }
  return { label: "open", cls: "history-badge history-badge-open" };
}

function ItemHistoryCard({ group }: { group: ItemOrderHistoryGroup }) {
  const expanded = expandedItemOrders.value.has(group.orderId);
  const badge = getItemBadge(group);
  const totalSb = itemSbTotal(group.price, group.filledQuantity).toLocaleString();

  return (
    <div class="history-card">
      <div
        class="history-card-header"
        onClick={() => toggleItemExpand(group.orderId)}
      >
        <div class="history-card-thumb">
          {group.itemThumbnail ? (
            <img
              class="history-thumb"
              src={group.itemThumbnail}
              alt={group.itemName}
              width={32}
              height={32}
            />
          ) : (
            <div class="history-thumb-placeholder">
              <IconStore size={20} />
            </div>
          )}
        </div>
        <div class="history-card-info">
          <div class="history-card-title">
            <span class="market-icon-inline wm-item"><IconDiamond size={13} /></span>
            {group.itemName}
          </div>
          <div class="history-card-meta">
            {group.filledQuantity}/{group.quantity} items &middot; {totalSb} SB
          </div>
          <div class="history-card-date">
            Last sale: {formatRelative(group.lastActivityAt)}
          </div>
        </div>
        <div class="history-card-right">
          <span class={badge.cls}>{badge.label}</span>
          <span class="expand-toggle">
            {expanded ? <IconX size={14} /> : <IconEllipsis size={14} />}
          </span>
        </div>
      </div>
      {expanded && (
        <div class="history-drawer">
          {group.transactions.map((line) => (
            <ItemTransactionDrawerRow
              key={line.id}
              line={line}
              side={group.side}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getMapBadge(group: MapOrderHistoryGroup): { label: string; cls: string } {
  if (group.filledQuantity >= group.quantity) {
    return { label: "completed", cls: "history-badge history-badge-completed" };
  }
  if (group.status === "cancelled") {
    return { label: "closed", cls: "history-badge history-badge-closed" };
  }
  return { label: "open", cls: "history-badge history-badge-open" };
}

function MapTransactionDrawerRow({
  line,
  side,
}: {
  line: MapTransactionLine;
  side: "sell" | "buy";
}) {
  const profileUrl = `https://www.mousehuntgame.com/profile.php?snuid=${line.counterpartySnUserId}`;
  const priceStr =
    side === "buy"
      ? `-${line.price.toLocaleString()} SB`
      : `${line.price.toLocaleString()} SB`;

  return (
    <div class="history-drawer-row">
      <div class="history-drawer-main">
        <span class="history-drawer-date">{formatDrawerDate(line.completedAt!)}</span>
        <span class="history-drawer-sep">&middot;</span>
        <a
          class="history-drawer-link"
          href={profileUrl}
          title={line.counterpartySnUserId}
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            openInGameTab(profileUrl);
          }}
        >
          {line.counterpartySnUserId}
        </a>
        <span class="history-drawer-sep">&middot;</span>
        <span class={`history-drawer-price ${side}`}>{priceStr}</span>
      </div>
    </div>
  );
}

function MapHistoryCard({ group }: { group: MapOrderHistoryGroup }) {
  const expanded = expandedMapOrders.value.has(group.orderId);
  const badge = getMapBadge(group);
  const totalSb = (group.price * group.filledQuantity).toLocaleString();

  return (
    <div class="history-card">
      <div
        class="history-card-header"
        onClick={() => toggleMapExpand(group.orderId)}
      >
        <div class="history-card-thumb">
          {group.mapThumbnail ? (
            <img
              class="history-thumb"
              src={group.mapThumbnail}
              alt={group.mapDisplayName}
              width={32}
              height={32}
            />
          ) : (
            <div class="history-thumb-placeholder">
              <IconMap size={20} />
            </div>
          )}
        </div>
        <div class="history-card-info">
          <div class="history-card-title">
            <span class="market-icon-inline wm-map">
              {group.mode === "completed" ? <IconCheckCircle size={13} /> : <IconMap size={13} />}
            </span>
            {group.mapDisplayName}
            {group.tier && <span class={`tier-mini tier-mini-${group.tier.toLowerCase()}`}>{group.tier}</span>}
          </div>
          <div class="history-card-meta">
            {group.filledQuantity}/{group.quantity} maps &middot; {totalSb} SB
          </div>
          <div class="history-card-date">
            Last sale: {formatRelative(group.transactions[0]?.completedAt || group.createdAt)}
          </div>
        </div>
        <div class="history-card-right">
          <span class={badge.cls}>{badge.label}</span>
          <span class="expand-toggle">
            {expanded ? <IconX size={14} /> : <IconEllipsis size={14} />}
          </span>
        </div>
      </div>
      {expanded && (
        <div class="history-drawer">
          {group.transactions.map((line) => (
            <MapTransactionDrawerRow
              key={line.transactionId}
              line={line}
              side={group.side}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TransactionHistory() {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const allItems = mergedHistory.value;

  const items = allItems.filter((item) => {
    if (filter === "all") return true;
    if (filter === "slots") return item.kind === "slot";
    if (filter === "sniping") return item.kind === "sniping";
    if (filter === "items") return item.kind === "item";
    if (filter === "maps") return item.kind === "map";
    return true;
  });

  if (allItems.length === 0) return null;

  // Pagination: determine current page and total pages based on active tab
  let currentPage: number; // 0-based for PaginationBar
  let totalPages: number;
  let handlePageChange: (p: number) => void;

  if (filter === "all") {
    // Synced navigation – all markets on same page
    const allTotalPages = Math.max(
      historyTotalPages.value,
      snipingHistoryTotalPages.value,
      itemHistoryTotalPages.value,
      mapHistoryTotalPages.value,
    );
    // Use the max of current pages as the synced page
    const syncedPage = Math.max(
      historyPage.value,
      snipingHistoryPage.value,
      itemHistoryPage.value,
      mapHistoryPage.value,
    );
    currentPage = syncedPage - 1; // convert 1-based to 0-based
    totalPages = allTotalPages;
    handlePageChange = (p: number) => {
      goToAllPage(p + 1); // convert 0-based to 1-based
      scrollRef.current?.scrollTo({ top: 0 });
    };
  } else if (filter === "slots") {
    currentPage = historyPage.value - 1;
    totalPages = historyTotalPages.value;
    handlePageChange = (p: number) => {
      goToSlotPage(p + 1);
      scrollRef.current?.scrollTo({ top: 0 });
    };
  } else if (filter === "sniping") {
    currentPage = snipingHistoryPage.value - 1;
    totalPages = snipingHistoryTotalPages.value;
    handlePageChange = (p: number) => {
      goToSnipingPage(p + 1);
      scrollRef.current?.scrollTo({ top: 0 });
    };
  } else if (filter === "items") {
    currentPage = itemHistoryPage.value - 1;
    totalPages = itemHistoryTotalPages.value;
    handlePageChange = (p: number) => {
      goToItemPage(p + 1);
      scrollRef.current?.scrollTo({ top: 0 });
    };
  } else {
    currentPage = mapHistoryPage.value - 1;
    totalPages = mapHistoryTotalPages.value;
    handlePageChange = (p: number) => {
      goToMapPage(p + 1);
      scrollRef.current?.scrollTo({ top: 0 });
    };
  }

  return (
    <div class="transaction-history">
      <div class="history-header">
        <h3>Transaction History</h3>
      </div>

      {/* Filter chips */}
      <div class="order-filter-chips">
        {(["all", "slots", "sniping", "items", "maps"] as const).map((f) => (
          <button
            key={f}
            class={`pill${filter === f ? " active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div class="paginated-scroll" ref={scrollRef}>
        <div class="history-list">
          {items.map((item) => {
            if (item.kind === "slot") {
              return <OrderHistoryCard key={`slot-${item.group.orderId}`} group={item.group} />;
            }
            if (item.kind === "sniping") {
              return <SnipingHistoryCard key={`snipe-${item.group.mhMapId}`} group={item.group} />;
            }
            if (item.kind === "item") {
              return <ItemHistoryCard key={`item-${item.group.orderId}`} group={item.group} />;
            }
            return <MapHistoryCard key={`map-${item.group.orderId}`} group={item.group} />;
          })}
        </div>

        {items.length === 0 && (
          <p class="empty">No {filter === "all" ? "" : filter + " "}transactions yet.</p>
        )}
      </div>

      <div class="pagination-fixed">
        <PaginationBar page={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
      </div>
    </div>
  );
}