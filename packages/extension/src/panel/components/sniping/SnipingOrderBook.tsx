import type { SnipingPricePoint, SnipingSalesStats, SnipingOrderBookLevel } from "@mhcm/shared";
import {
  snipingOrderBook, snipingGoalMode,
  selectedMouseTypeId, selectedMouseGroupId, selectedMouseInfo,
  selectedItemTypeId, selectedItemGroupId, selectedItemInfo,
} from "../../signals/sniping.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconTrendingUp, IconTrendingDown } from "../common/Icons.js";
import { computeTrend, formatVolume } from "../../utils/format.js";
import { PriceChart } from "../common/PriceChart.js";

const MAX_VISIBLE_LEVELS = 4;

function bookMatchesSelection(book: { mouseTypeId?: number; mouseGroupId?: number; itemTypeId?: number; itemGroupId?: number }): boolean {
  if (selectedMouseGroupId.value) return book.mouseGroupId === selectedMouseGroupId.value;
  if (selectedMouseTypeId.value) return book.mouseTypeId === selectedMouseTypeId.value;
  if (selectedItemGroupId.value) return book.itemGroupId === selectedItemGroupId.value;
  if (selectedItemTypeId.value) return book.itemTypeId === selectedItemTypeId.value;
  return false;
}

export function SnipingOrderBook() {
  const book = snipingOrderBook.value;
  const isItemMode = snipingGoalMode.value === "item";
  const hasSelection = isItemMode
    ? (selectedItemTypeId.value || selectedItemGroupId.value)
    : (selectedMouseTypeId.value || selectedMouseGroupId.value);

  if (!hasSelection) {
    return (
      <div class="order-book">
        <p class="empty">Select {isItemMode ? "an item" : "a mouse"} to view the order book.</p>
      </div>
    );
  }

  if (!book || !bookMatchesSelection(book)) {
    return (
      <div class="order-book">
        <div class="market-block" />
        <div class="market-block" />
        <div class="book-block" />
        <div class="book-block" />
      </div>
    );
  }

  const { priceHistory, sales } = book.stats;

  const relatedGroups = isItemMode ? book.groupsContainingItem : book.groupsContainingMouse;
  const mouseGroupMembers = book.groupMembers;
  const itemGroupMembersArr = book.itemGroupMembers;

  return (
    <div class="order-book">
      {mouseGroupMembers && mouseGroupMembers.length > 0 && (
        <GroupMembersBlock
          members={mouseGroupMembers.map((m) => ({ id: m.mouseTypeId, name: m.name, thumbnail: m.thumbnail }))}
          label="Mice"
        />
      )}
      {itemGroupMembersArr && itemGroupMembersArr.length > 0 && (
        <GroupMembersBlock
          members={itemGroupMembersArr.map((m) => ({ id: m.itemTypeId, name: m.name, thumbnail: m.thumbnail }))}
          label="Items"
        />
      )}
      <PriceHistoryBlock history={priceHistory} />
      <SalesBlock sales={sales} />
      {relatedGroups && relatedGroups.length > 0 && (
        <RelatedGroupsBlock groups={relatedGroups} isItemMode={isItemMode} />
      )}
      <LevelTable side="sell" levels={book.sells} />
      <LevelTable side="buy" levels={book.buys} />
    </div>
  );
}

function PriceHistoryBlock({ history }: { history: SnipingPricePoint[] }) {
  const trend = computeTrend(history);

  return (
    <div class="market-block">
      <div class="block-header">
        <span class="block-title">Price History</span>
        {trend !== null ? (
          <span class={`trend ${trend >= 0 ? "trend-up" : "trend-down"}`}>
            {trend >= 0 ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
            {" "}
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        ) : (
          <span class="trend">--%</span>
        )}
      </div>
      <PriceChart points={history} />
    </div>
  );
}

function SalesBlock({ sales }: { sales: SnipingSalesStats }) {
  return (
    <div class="market-block">
      <div class="block-header">
        <span class="block-title">Completed Snipes</span>
      </div>
      <div class="sales-grid">
        <div class="sales-cell">
          <div class="sales-value">{formatVolume(sales.yesterday)}</div>
          <div class="sales-label">Yesterday</div>
        </div>
        <div class="sales-cell">
          <div class="sales-value">{formatVolume(sales.week)}</div>
          <div class="sales-label">Week</div>
        </div>
        <div class="sales-cell">
          <div class="sales-value">{formatVolume(sales.month)}</div>
          <div class="sales-label">Month</div>
        </div>
      </div>
    </div>
  );
}

function GroupMembersBlock({
  members,
  label,
}: {
  members: Array<{ id: number; name: string; thumbnail: string | null }>;
  label: string;
}) {
  return (
    <div class="market-block group-members">
      <div class="block-header">
        <span class="block-title">{label} in Group ({members.length})</span>
      </div>
      <div class="group-members-list">
        {members.map((m) => (
          <div key={m.id} class="group-member-item">
            {m.thumbnail && (
              <img class="mouse-thumb-sm" src={m.thumbnail} alt="" />
            )}
            <span class="group-member-name">{m.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelatedGroupsBlock({
  groups,
  isItemMode,
}: {
  groups: Array<{ groupId: number; groupName: string }>;
  isItemMode: boolean;
}) {
  const handleClick = (groupId: number, groupName: string) => {
    if (isItemMode) {
      // Unsubscribe current item
      if (selectedItemTypeId.value) {
        wsSend({ type: "unsubscribe_sniping_order_book", payload: { itemTypeId: selectedItemTypeId.value } });
      }
      // Switch to item group view
      selectedItemTypeId.value = null;
      selectedItemGroupId.value = groupId;
      selectedItemInfo.value = { id: groupId, name: groupName, thumbnail: null, isGroup: true };
      snipingOrderBook.value = null;
      wsSend({ type: "subscribe_sniping_order_book", payload: { itemGroupId: groupId } });
    } else {
      // Unsubscribe current mouse
      if (selectedMouseTypeId.value) {
        wsSend({ type: "unsubscribe_sniping_order_book", payload: { mouseTypeId: selectedMouseTypeId.value } });
      }
      // Switch to mouse group view
      selectedMouseTypeId.value = null;
      selectedMouseGroupId.value = groupId;
      selectedMouseInfo.value = { id: groupId, name: groupName, thumbnail: null, isGroup: true };
      snipingOrderBook.value = null;
      wsSend({ type: "subscribe_sniping_order_book", payload: { mouseGroupId: groupId } });
    }
  };

  return (
    <div class="market-block related-groups">
      <div class="block-header">
        <span class="block-title">Related Groups</span>
      </div>
      <div class="related-groups-list">
        {groups.map((g) => (
          <button
            key={g.groupId}
            type="button"
            class="related-group-link"
            onClick={() => handleClick(g.groupId, g.groupName)}
          >
            {g.groupName}
          </button>
        ))}
      </div>
    </div>
  );
}

function LevelTable({ side, levels }: { side: "sell" | "buy"; levels: SnipingOrderBookLevel[] }) {
  const visible = levels.slice(0, MAX_VISIBLE_LEVELS);
  const rest = levels.slice(MAX_VISIBLE_LEVELS);
  const restQty = rest.reduce((sum, l) => sum + l.quantity, 0);
  const isSell = side === "sell";

  return (
    <div class="book-block">
      <div class="block-header">
        <span class="block-title">{isSell ? "Sell Orders:" : "Buy Orders:"}</span>
      </div>

      {levels.length === 0 ? (
        <div class="book-empty">No listings.</div>
      ) : (
        <>
          <table class="book-table">
            <thead>
              <tr>
                <th>Quantity</th>
                <th class="col-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((level, i) => (
                <tr key={i}>
                  <td>{level.quantity.toLocaleString()}</td>
                  <td class={`col-right price ${side}`}>
                    {level.price.toLocaleString()} SB
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div class={`book-summary${rest.length === 0 ? " no-more" : ""}`}>
            {rest.length > 0
              ? `${formatVolume(restQty)} more for ${rest[0].price.toLocaleString()} SB ${isSell ? "and up" : "or less"}.`
              : "No more listings."}
          </div>
        </>
      )}
    </div>
  );
}
