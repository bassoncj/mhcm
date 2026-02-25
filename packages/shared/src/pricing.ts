/**
 * Item marketplace fractional pricing utilities.
 *
 * Prices are stored as actual SB values (1.3 = 1.3 SB).
 * MOQ enforcement ensures price * qty always produces a whole SB total.
 */

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/**
 * Returns the minimum order quantity for a given price.
 * Only 4 possible results: 1, 2, 5, or 10.
 *
 * .0 (whole) → 1, .5 → 2, .2/.4/.6/.8 → 5, .1/.3/.7/.9 → 10
 */
export function getItemMoq(price: number): number {
  const lastDigit = ((Math.round(price * 10) % 10) + 10) % 10;
  return 10 / gcd(lastDigit, 10);
}

/**
 * Computes the whole SB total for an item order.
 * Uses integer-tenths arithmetic internally to avoid floating-point drift.
 */
export function itemSbTotal(price: number, qty: number): number {
  return (Math.round(price * 10) * qty) / 10;
}

/**
 * Returns true if price * qty produces a whole number of SB.
 */
export function isWholeTotal(price: number, qty: number): boolean {
  return (Math.round(price * 10) * qty) % 10 === 0;
}

/**
 * Formats a price for display: 1.3 → "1.3", 2 → "2", 0.5 → "0.5".
 * No trailing .0 for whole prices. Thousands separator on integer part.
 */
export function formatItemPrice(price: number): string {
  if (Number.isInteger(price)) {
    return price.toLocaleString();
  }
  const intPart = Math.floor(price);
  const decPart = Math.round((price - intPart) * 10);
  return `${intPart.toLocaleString()}.${decPart}`;
}
