import type { OrderBookLevel, PricePoint, SalesStats, TierVolume } from "@mhcm/shared";
import { orderBook, selectedMapTypeId, tierFilter, rtFilter } from "../../signals/slots.js";
import { IconTrendingUp, IconTrendingDown } from "../common/Icons.js";
import { computeTrend, formatVolume } from "../../utils/format.js";
import { PriceChart } from "../common/PriceChart.js";

const MAX_VISIBLE_LEVELS = 4;

// B includes none/untiered
function sumTierVolume(tv: TierVolume, filter: Set<string>): number {
  if (filter.size === 0) return tv.S + tv.A + tv.B + tv.none;
  const includeB = filter.has("B");
  return (
    (filter.has("S") ? tv.S : 0) +
    (filter.has("A") ? tv.A : 0) +
    (includeB ? tv.B + tv.none : 0)
  );
}

export function OrderBook() {
  const book = orderBook.value;
  const mapTypeId = selectedMapTypeId.value;

  if (!mapTypeId) {
    return (
      <div class="order-book">
        <p class="empty">Select a map type to view the order book.</p>
      </div>
    );
  }

  if (!book || book.mapTypeId !== mapTypeId) {
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
  const filter = tierFilter.value;

  // Apply tier filter to sell orders (B includes untiered/none)
  const filteredSells = filter.size === 0
    ? book.sells
    : book.sells
        .map((level) => {
          if (!level.tierBreakdown) return level;
          const includeB = filter.has("B");
          const filteredQty =
            (filter.has("S") ? level.tierBreakdown.S : 0) +
            (filter.has("A") ? level.tierBreakdown.A : 0) +
            (includeB ? level.tierBreakdown.B + level.tierBreakdown.none : 0);
          if (filteredQty === 0) return null;
          return { ...level, quantity: filteredQty };
        })
        .filter((l): l is OrderBookLevel => l !== null);

  // Apply tier filter to buy orders (show orders that ACCEPT selected tiers)
  const filteredBuys = filter.size === 0
    ? book.buys
    : book.buys
        .map((level) => {
          if (!level.acceptedTiersBreakdown) return level;
          // For buy orders, we want orders that accept at least one selected tier
          // Since a single order can accept multiple tiers, we take the max of selected tiers
          // to avoid double-counting, but show the total quantity if ANY selected tier is accepted
          const atb = level.acceptedTiersBreakdown;
          const includeB = filter.has("B");
          // An order that accepts S,A,B would be counted once if any of those are selected
          // We show level.quantity if there's overlap, filtered otherwise
          const hasOverlap =
            (filter.has("S") && atb.S > 0) ||
            (filter.has("A") && atb.A > 0) ||
            (includeB && atb.B > 0);
          if (!hasOverlap) return null;
          // For buy orders that accept multiple tiers, we show the quantity accepting
          // the "best" selected tier to avoid overcounting
          // Actually, simpler: show how many slots accept ANY of the selected tiers
          // Since orders accepting multiple tiers are counted in each, take min of total
          const filteredQty = Math.min(
            level.quantity,
            Math.max(
              filter.has("S") ? atb.S : 0,
              filter.has("A") ? atb.A : 0,
              includeB ? atb.B : 0
            )
          );
          if (filteredQty === 0) return null;
          return { ...level, quantity: filteredQty };
        })
        .filter((l): l is OrderBookLevel => l !== null);

  // Apply tier filter to price history
  const filteredHistory = filter.size === 0
    ? priceHistory
    : priceHistory
        .map((p) => ({
          ...p,
          volume: sumTierVolume(p.tierVolume, filter),
        }))
        .filter((p) => p.volume > 0);

  // Apply tier filter to sales
  const filteredSales: SalesStats = filter.size === 0
    ? sales
    : {
        yesterday: sumTierVolume(sales.tierVolume.yesterday, filter),
        week: sumTierVolume(sales.tierVolume.week, filter),
        month: sumTierVolume(sales.tierVolume.month, filter),
        tierVolume: sales.tierVolume,
      };

  // Apply RT filter to sell and buy orders
  const rt = rtFilter.value;
  const rtFilteredSells = rt === "off"
    ? filteredSells
        .map((level) => {
          // Subtract RT-only qty (sells where rtQty covers full quantity are RT-only)
          const rtQty = level.rtQty ?? 0;
          const nonRtQty = level.quantity - rtQty;
          if (nonRtQty <= 0) return null;
          return { ...level, quantity: nonRtQty };
        })
        .filter((l): l is OrderBookLevel => l !== null)
    : rt === "only"
    ? filteredSells
        .map((level) => {
          const rtQty = level.rtQty ?? 0;
          if (rtQty <= 0) return null;
          return { ...level, quantity: rtQty };
        })
        .filter((l): l is OrderBookLevel => l !== null)
    : filteredSells; // "all" — show everything

  const rtFilteredBuys = rt === "off"
    ? filteredBuys
        .map((level) => {
          const rtQty = level.rtQty ?? 0;
          const nonRtQty = level.quantity - rtQty;
          if (nonRtQty <= 0) return null;
          return { ...level, quantity: nonRtQty };
        })
        .filter((l): l is OrderBookLevel => l !== null)
    : rt === "only"
    ? filteredBuys
        .map((level) => {
          const rtQty = level.rtQty ?? 0;
          if (rtQty <= 0) return null;
          return { ...level, quantity: rtQty };
        })
        .filter((l): l is OrderBookLevel => l !== null)
    : filteredBuys; // "all"

  const showRtMarker = rt === "all";

  return (
    <div class="order-book">
      <PriceHistoryBlock history={filteredHistory} />
      <SalesBlock sales={filteredSales} />
      <LevelTable side="sell" levels={rtFilteredSells} showRtMarker={showRtMarker} />
      <LevelTable side="buy" levels={rtFilteredBuys} showRtMarker={showRtMarker} />
    </div>
  );
}

function PriceHistoryBlock({ history }: { history: PricePoint[] }) {
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

function SalesBlock({ sales }: { sales: SalesStats }) {
  return (
    <div class="market-block">
      <div class="block-header">
        <span class="block-title">Sales</span>
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

function LevelTable({ side, levels, showRtMarker = false }: { side: "sell" | "buy"; levels: OrderBookLevel[]; showRtMarker?: boolean }) {
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
                <th class="col-right">Unit Price</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((level, i) => (
                <tr key={i}>
                  <td>
                    {level.quantity.toLocaleString()}
                    {showRtMarker && (level.rtQty ?? 0) > 0 && (
                      <span class="rt-star" title={`${level.rtQty} RT`}>★</span>
                    )}
                  </td>
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

