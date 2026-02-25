import type { MouseType, MouseMapTier, MouseAlias, SnipingTarget, ItemType, UserRole } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import type { MouseTypeRow, MouseOrGroupRow, MouseMapTierRow } from "../../db/queries/mouse-types.js";
import type { MouseAliasRow } from "../../db/queries/mouse-aliases.js";
import type { ItemTypeRow, ItemOrGroupRow } from "../../db/queries/item-types.js";
import { getGroupThumbDataUrl } from "../../util/group-thumb.js";
import { findUserById } from "../../db/queries/users.js";
import { isDiscordIdAllowed } from "../../db/queries/allowed-testers.js";

export function isAdminOrMod(user: JWTPayload): boolean {
  return user.role === "admin" || user.role === "moderator";
}

export function isAdmin(user: JWTPayload): boolean {
  return user.role === "admin";
}

export function rowToMouseType(row: MouseTypeRow | MouseOrGroupRow): MouseType {
  const base: MouseType = {
    id: row.id,
    type: row.type,
    name: row.name,
    abbreviatedName: row.abbreviated_name,
    thumbnail: row.thumbnail,
    globalTier: row.global_tier as MouseType["globalTier"],
  };
  if ("is_group" in row && row.is_group) {
    base.isGroup = true;
    base.enabled = !!row.enabled;
    base.archived = !!row.archived;
    base.mouseCount = row.mouse_count ?? 0;
    base.thumbnail = getGroupThumbDataUrl(row.id);
  }
  if ("aliases_str" in row && row.aliases_str) {
    base.aliases = row.aliases_str;
  }
  return base;
}

export function rowToMouseMapTier(row: MouseMapTierRow): MouseMapTier {
  return {
    mouseTypeId: row.mouse_type_id,
    mapTypeId: row.map_type_id,
    tier: row.tier as MouseMapTier["tier"],
  };
}

export function rowToMouseAlias(row: MouseAliasRow): MouseAlias {
  return {
    id: row.id,
    mouseTypeId: row.mouse_type_id,
    alias: row.alias,
    source: row.source,
  };
}

/** Convert an ItemTypeRow or ItemOrGroupRow (SQLite integers) to the shared ItemType (booleans). */
export function rowToItemType(row: ItemTypeRow | ItemOrGroupRow): ItemType {
  const base: ItemType = {
    id: row.id,
    type: row.type,
    name: row.name,
    classification: row.classification,
    thumbnail: row.thumbnail,
    alias: row.alias,
    globalTier: row.global_tier as ItemType["globalTier"],
    isTradable: row.is_tradable === 1,
    systemHidden: row.system_hidden === 1,
    enabled: row.enabled === 1,
    alwaysWarn: row.always_warn === 1,
  };
  if ("is_group" in row && row.is_group) {
    base.isGroup = true;
    base.enabled = !!row.enabled;
    base.archived = !!row.archived;
    base.itemCount = row.item_count ?? 0;
    base.thumbnail = getGroupThumbDataUrl(row.id, "item");
  }
  return base;
}

export function isUserBetaEligible(userId: number, role: UserRole): boolean {
  if (role !== "user") return true;
  const user = findUserById(userId);
  return user?.discord_id ? isDiscordIdAllowed(user.discord_id) : false;
}

export function targetFromPayload(payload: {
  mouseTypeId?: number;
  mouseGroupId?: number;
  itemTypeId?: number;
  itemGroupId?: number;
}): SnipingTarget {
  if (payload.mouseGroupId != null) return { mouseGroupId: payload.mouseGroupId };
  if (payload.itemTypeId != null) return { itemTypeId: payload.itemTypeId };
  if (payload.itemGroupId != null) return { itemGroupId: payload.itemGroupId };
  return { mouseTypeId: payload.mouseTypeId! };
}
