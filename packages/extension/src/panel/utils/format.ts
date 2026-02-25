import { formatItemPrice } from "@mhcm/shared";

export function formatPrice(price: number | null): string {
  if (price == null) return "--";
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)}M SB`;
  if (price >= 10_000) return `${(price / 1_000).toFixed(1)}K SB`;
  return `${price.toLocaleString()} SB`;
}

/** Like formatPrice but handles fractional item prices (e.g. 1.3 SB). */
export function formatItemDisplayPrice(price: number | null): string {
  if (price == null) return "--";
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)}M SB`;
  if (price >= 10_000) return `${(price / 1_000).toFixed(1)}K SB`;
  return `${formatItemPrice(price)} SB`;
}

export function formatVolume(n: number): string {
  if (n === 0) return "-";
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function padToSix<T>(items: T[]): (T | null)[] {
  const result: (T | null)[] = [...items];
  while (result.length < 6) result.push(null);
  return result;
}

export function computeTrend(history: { avgPrice: number }[]): number | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1].avgPrice;

  // Compare to ~7 days ago (or the earliest point if < 7 days of data)
  const targetIdx = Math.max(0, history.length - 8);
  const older = history[targetIdx].avgPrice;
  if (older === 0) return null;

  return Math.round(((latest - older) / older) * 100);
}
