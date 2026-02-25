import type { ItemPricePoint, ItemSalesStats, ItemOrderBookLevel } from "@mhcm/shared";
import { formatItemPrice } from "@mhcm/shared";
import { itemOrderBook, selectedItemTypeId } from "../../signals/items.js";
import { IconTrendingUp, IconTrendingDown } from "../common/Icons.js";
import { computeTrend, formatVolume } from "../../utils/format.js";
import { PriceChart } from "../common/PriceChart.js";

const MAX_VISIBLE_LEVELS = 4;

export function ItemOrderBook() {
  const book = itemOrderBook.value;

  if (!selectedItemTypeId.value) {
    return (
      <div class="order-book">
        <p class="empty">Select an item to view the order book.</p>
      </div>
    );
  }

  if (!book || book.itemTypeId !== selectedItemTypeId.value) {
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

  return (
    <div class="order-book">
      <PriceHistoryBlock history={priceHistory} />
      <SalesBlock sales={sales} />
      <LevelTable side="sell" levels={book.sells} />
      <LevelTable side="buy" levels={book.buys} />
    </div>
  );
}

function PriceHistoryBlock({ history }: { history: ItemPricePoint[] }) {
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
      <PriceChart
        points={history}
        tooltipExtra={(pt) => `Vol: ${(pt as ItemPricePoint).volume.toLocaleString()}`}
        formatPriceFn={(p) => `${formatItemPrice(p)} SB`}
      />
    </div>
  );
}

function SalesBlock({ sales }: { sales: ItemSalesStats }) {
  return (
    <div class="market-block">
      <div class="block-header">
        <span class="block-title">Completed Trades</span>
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

function LevelTable({ side, levels }: { side: "sell" | "buy"; levels: ItemOrderBookLevel[] }) {
  const visible = levels.slice(0, MAX_VISIBLE_LEVELS);
  const rest = levels.slice(MAX_VISIBLE_LEVELS);
  const restQty = rest.reduce((sum, l) => sum + l.totalQuantity, 0);
  const restOrders = rest.reduce((sum, l) => sum + l.orderCount, 0);
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
                <th>Price</th>
                <th>Qty</th>
                <th class="col-right">Orders</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((level, i) => (
                <tr key={i}>
                  <td class={`price ${side}`}>
                    {formatItemPrice(level.price)} SB
                  </td>
                  <td>{level.totalQuantity.toLocaleString()}</td>
                  <td class="col-right">({level.orderCount})</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div class={`book-summary${rest.length === 0 ? " no-more" : ""}`}>
            {rest.length > 0
              ? `and ${restOrders} more listing${restOrders === 1 ? "" : "s"} (${formatVolume(restQty)} units)`
              : "No more listings."}
          </div>
        </>
      )}
    </div>
  );
}
