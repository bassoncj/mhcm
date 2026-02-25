/** Tier classifications for mice (S = guaranteed, A = likely, B = uncertain). */
export type MouseTier = "S" | "A" | "B";

/**
 * Order tier can be a classification or null (untiered/legacy).
 * - S/A/B: calculated tier based on remaining mice
 * - null: untiered (historical orders or maps without tier data)
 */
export type OrderTier = MouseTier | null;

/** A mouse type entry from the database. */
export interface MouseType {
  id: number;
  /** Internal type string (e.g., "ancient_of_the_deep"). */
  type: string;
  /** Display name (e.g., "Ancient of the Deep"). */
  name: string;
  /** Abbreviated name. */
  abbreviatedName: string;
  /** Thumbnail image URL. */
  thumbnail: string | null;
  /** Global tier override (null = default to B in calculations). */
  globalTier: MouseTier | null;
  /** True when this entry represents a sniping mouse group, not an individual mouse. */
  isGroup?: boolean;
  /** Group-only: whether the group is enabled for trading. */
  enabled?: boolean;
  /** Group-only: whether the group is archived. */
  archived?: boolean;
  /** Group-only: number of mice in the group. */
  mouseCount?: number;
  /** Comma-separated aliases (populated by admin list endpoint). */
  aliases?: string;
}

/** Per-map-type tier override for a mouse. */
export interface MouseMapTier {
  mouseTypeId: number;
  mapTypeId: number;
  tier: MouseTier;
}

/** A mouse alias entry. */
export interface MouseAlias {
  id: number;
  mouseTypeId: number;
  alias: string;
  source: string | null;
}
