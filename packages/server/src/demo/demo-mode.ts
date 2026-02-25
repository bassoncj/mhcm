import type { MarketType } from "@mhcm/shared";

let demoEnabled = false;

const demoMarketVisible: Record<MarketType, boolean> = {
  slots: true, items: true, maps: true, sniping: true,
};

export function isDemoEnabled(): boolean {
  return demoEnabled;
}

export function setDemoEnabled(enabled: boolean): void {
  demoEnabled = enabled;
}

export function isDemoMarketVisible(market: MarketType): boolean {
  return demoEnabled && demoMarketVisible[market];
}

export function setDemoMarketVisible(market: MarketType, visible: boolean): void {
  demoMarketVisible[market] = visible;
}

export function getDemoMarketConfig(): Record<MarketType, boolean> {
  return { ...demoMarketVisible };
}

/**
 * SQL fragment for filtering demo data in display queries.
 * When market is provided, checks per-market visibility.
 * When market is omitted, checks global toggle (backwards compat).
 * Returns empty string to include demo data, or ` AND <alias>.is_demo = 0` to exclude.
 */
export function demoOrderFilter(alias: string, market?: MarketType): string {
  const visible = market ? isDemoMarketVisible(market) : isDemoEnabled();
  if (visible) return "";
  return ` AND ${alias}.is_demo = 0`;
}

export function demoTxnFilter(alias: string, market?: MarketType): string {
  const visible = market ? isDemoMarketVisible(market) : isDemoEnabled();
  if (visible) return "";
  return ` AND ${alias}.is_demo = 0`;
}
