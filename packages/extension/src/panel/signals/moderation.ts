import { signal } from "@preact/signals";
import type { MouseType, MouseMapTier, MouseTierWithInfo, MouseAlias, SnipingMouseGroup, SnipingItemGroup, ItemType, ItemMapTier, ItemTierWithInfo, Scroll, Rank, UserListItem, ModMapTypeItem, Suspension } from "@mhcm/shared";

/** List of mice from mod search. */
export const modMice = signal<MouseType[]>([]);

/** Total count for pagination. */
export const modMiceTotal = signal<number>(0);

/** Currently selected mouse for detailed editing. */
export const selectedMouseId = signal<number | null>(null);

/** Map tier overrides for the selected mouse. */
export const selectedMouseMapTiers = signal<MouseMapTier[]>([]);

/** Loading state for mod operations. */
export const modMiceLoading = signal<boolean>(false);

/** Mouse tiers for a specific map type (map-centric view). */
export const mapMouseTiers = signal<Record<number, MouseTierWithInfo[]>>({});

/** Aliases for the currently selected mouse. */
export const selectedMouseAliases = signal<MouseAlias[]>([]);

/** List of sniping mouse groups from moderation panel. */
export const modGroups = signal<SnipingMouseGroup[]>([]);

/** Currently expanded group ID for detail drawer. */
export const selectedGroupId = signal<number | null>(null);

/** Members of the currently selected group. */
export const selectedGroupMembers = signal<Array<{ mouseTypeId: number; mouseName: string; mouseThumbnail: string | null }>>([]);

/** List of sniping item groups from moderation panel. */
export const modItemGroups = signal<SnipingItemGroup[]>([]);

/** Currently expanded item group ID for detail drawer. */
export const selectedItemGroupId = signal<number | null>(null);

/** Members of the currently selected item group. */
export const selectedItemGroupMembers = signal<Array<{ itemTypeId: number; itemName: string; itemThumbnail: string | null }>>([]);

/** Paginated item list from mod_list_items. */
export const modItems = signal<ItemType[]>([]);

/** Total count for pagination. */
export const modItemsTotal = signal<number>(0);

/** Currently selected item ID for detail drawer (tier overrides). */
export const selectedItemId = signal<number | null>(null);

/** Map tier overrides for the selected item. */
export const selectedItemMapTiers = signal<ItemMapTier[]>([]);

/** Item tiers for a specific map type (map-centric view in ModerationPanel drawer). */
export const mapItemTiers = signal<Record<number, ItemTierWithInfo[]>>({});

/** Available classifications for the mod item list (filtered by system_hidden state). */
export const modItemClassifications = signal<string[]>([]);

/** Risk locations for the currently selected item (expanded drawer). */
export const selectedItemRiskLocations = signal<Array<{ environmentType: string; environmentName: string }>>([]);

/** Environment search results for autocomplete in item risk location editor. */
export const environmentSearchResults = signal<Array<{ type: string; name: string }>>([]);

/** List of scrolls (treasure map convertibles). */
export const modScrolls = signal<Scroll[]>([]);

/** List of MouseHunt ranks (titles). */
export const modRanks = signal<Rank[]>([]);

/** Map types as seen in the moderation panel (all, including disabled). */
export const modMapTypes = signal<ModMapTypeItem[]>([]);

/** Users as seen in the moderation panel. */
export const modUsers = signal<UserListItem[]>([]);

/** Suspension history for the currently expanded user drawer. */
export const modSuspensionHistory = signal<{ userId: number; suspensions: Suspension[] } | null>(null);
