import type { ClientMessage, ModMapTypeItem } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser } from "../connections.js";
import { isAdminOrMod } from "./handler-utils.js";
import { audit } from "../../audit.js";
import {
  findMapTypes,
  findMapTypeById,
  setMapTypeMarketEnabled,
  setMapTypeAlias,
  setMapTypeThumbnail,
  setMapTypeLastGoalCount,
  setMapTypeScroll,
  setMapTypeMinRank,
  setMapTypeClass,
  setMapTypeSupportsRt,
} from "../../db/queries/map-types.js";
import { broadcastMapTypes, cancelOrdersForDisabledMarket } from "../../maps/catalog.js";
import { searchScrolls } from "../../db/queries/scrolls.js";
import { getAllRanks } from "../../db/queries/ranks.js";

function rowToModMapType(r: ReturnType<typeof findMapTypes>[number]): ModMapTypeItem {
  return {
    id: r.id,
    mapType: r.map_type,
    quality: r.quality,
    goal: r.goal as "mouse" | "item",
    displayName: r.display_name,
    alias: r.alias,
    thumbnail: r.thumbnail,
    maxHunters: r.max_hunters,
    lastGoalCount: r.last_goal_count ?? 1,
    enabledSlots: r.enabled_slots === 1,
    enabledUnopened: r.enabled_unopened === 1,
    enabledComplete: r.enabled_complete === 1,
    scrollItemType: r.scroll_item_type,
    minRank: r.min_rank != null ? Number(r.min_rank) : null,
    mapClass: r.map_class ?? null,
    supportsRt: !!r.supports_rt,
    createdAt: r.created_at,
  };
}

function sendModMapTypesList(userId: number): void {
  const rows = findMapTypes("every");
  sendToUser(userId, {
    type: "mod_map_types_list",
    payload: { mapTypes: rows.map(rowToModMapType) },
  });
}

export function handleModMapTypeMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "mod_get_map_types": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_map_types" } });
        return true;
      }
      sendModMapTypesList(userId);
      return true;
    }

    case "mod_toggle_map_type_market": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_toggle_map_type_market" } });
        return true;
      }
      const { id, market, enable } = message.payload;

      if (!["slots", "unopened", "complete"].includes(market)) {
        sendToUser(userId, { type: "error", payload: { message: "Invalid market", source: "mod_toggle_map_type_market" } });
        return true;
      }

      const existing = findMapTypeById(id);
      if (!existing) {
        sendToUser(userId, { type: "error", payload: { message: "Map type not found", source: "mod_toggle_map_type_market" } });
        return true;
      }

      if (enable) {
        if (!existing.map_class) {
          sendToUser(userId, { type: "error", payload: { message: "Map class must be set before enabling", source: "mod_toggle_map_type_market" } });
          return true;
        }
        if (!existing.scroll_item_type) {
          sendToUser(userId, { type: "error", payload: { message: "Scroll must be linked before enabling", source: "mod_toggle_map_type_market" } });
          return true;
        }
        if (market === "unopened" && !existing.min_rank) {
          sendToUser(userId, { type: "error", payload: { message: "Min rank required for unopened market", source: "mod_toggle_map_type_market" } });
          return true;
        }
      }

      setMapTypeMarketEnabled(id, market, enable);

      if (!enable) {
        cancelOrdersForDisabledMarket(id, market as any, existing.display_name);
      }

      const event = enable ? "map_type_market_enabled" : "map_type_market_disabled";
      audit(event, userId, { mapTypeId: id, market });

      broadcastMapTypes();
      sendModMapTypesList(userId);
      return true;
    }

    case "mod_set_map_type_alias": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_map_type_alias" } });
        return true;
      }
      const { id: aliasId, alias } = message.payload;

      const existing = findMapTypeById(aliasId);
      if (!existing) {
        sendToUser(userId, { type: "error", payload: { message: "Map type not found", source: "mod_set_map_type_alias" } });
        return true;
      }

      setMapTypeAlias(aliasId, alias || null);
      audit("map_type_alias_updated", userId, { mapTypeId: aliasId, alias });
      broadcastMapTypes();
      sendModMapTypesList(userId);
      return true;
    }

    case "mod_set_map_type_thumbnail": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_map_type_thumbnail" } });
        return true;
      }
      const { id: thumbId, thumbnail } = message.payload;

      const existing = findMapTypeById(thumbId);
      if (!existing) {
        sendToUser(userId, { type: "error", payload: { message: "Map type not found", source: "mod_set_map_type_thumbnail" } });
        return true;
      }

      setMapTypeThumbnail(thumbId, thumbnail || null);
      audit("map_type_thumbnail_updated", userId, { mapTypeId: thumbId, thumbnail });
      broadcastMapTypes();
      sendModMapTypesList(userId);
      return true;
    }

    case "mod_set_map_type_last_goal_count": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_map_type_last_goal_count" } });
        return true;
      }
      const { id: goalId, lastGoalCount } = message.payload;

      if (lastGoalCount !== 1 && lastGoalCount !== 2 && lastGoalCount !== 3) {
        sendToUser(userId, { type: "error", payload: { message: "lastGoalCount must be 1, 2, or 3", source: "mod_set_map_type_last_goal_count" } });
        return true;
      }

      const existing = findMapTypeById(goalId);
      if (!existing) {
        sendToUser(userId, { type: "error", payload: { message: "Map type not found", source: "mod_set_map_type_last_goal_count" } });
        return true;
      }

      setMapTypeLastGoalCount(goalId, lastGoalCount);
      audit("map_type_goal_count_updated", userId, { mapTypeId: goalId, lastGoalCount });
      broadcastMapTypes();
      sendModMapTypesList(userId);
      return true;
    }

    case "mod_get_scrolls": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_scrolls" } });
        return true;
      }
      const scrollSearch = message.payload?.search ?? "";
      const scrolls = searchScrolls(scrollSearch);
      sendToUser(userId, { type: "mod_scrolls", payload: { scrolls } });
      return true;
    }

    case "mod_set_map_scroll": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_map_scroll" } });
        return true;
      }
      const { mapTypeId: scrollMapId, scrollItemType } = message.payload;
      setMapTypeScroll(scrollMapId, scrollItemType || null);
      audit("map_scroll_linked", userId, { mapTypeId: scrollMapId, scrollItemType });
      broadcastMapTypes();
      sendModMapTypesList(userId);
      return true;
    }

    case "mod_set_map_min_rank": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_map_min_rank" } });
        return true;
      }
      const { mapTypeId: rankMapId, minRank } = message.payload;
      setMapTypeMinRank(rankMapId, minRank ?? null);
      audit("map_min_rank_set", userId, { mapTypeId: rankMapId, minRank });
      broadcastMapTypes();
      sendModMapTypesList(userId);
      return true;
    }

    case "mod_set_map_class": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_map_class" } });
        return true;
      }
      const { mapTypeId: classMapId, mapClass } = message.payload;
      setMapTypeClass(classMapId, mapClass ?? null);
      audit("map_class_set", userId, { mapTypeId: classMapId, mapClass });
      broadcastMapTypes();
      sendModMapTypesList(userId);
      return true;
    }

    case "mod_set_map_supports_rt": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_map_supports_rt" } });
        return true;
      }
      const { mapTypeId: rtMapId, supportsRt } = message.payload;
      setMapTypeSupportsRt(rtMapId, supportsRt);
      audit("map_supports_rt_set", userId, { mapTypeId: rtMapId, supportsRt });
      broadcastMapTypes();
      sendModMapTypesList(userId);
      return true;
    }

    case "mod_get_ranks": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_ranks" } });
        return true;
      }
      const rankRows = getAllRanks();
      const ranks = rankRows.map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        largeImage: r.large_image,
        numTitleLocations: r.num_title_locations,
        numTotalLocations: r.num_total_locations,
      }));
      sendToUser(userId, { type: "mod_ranks", payload: { ranks } });
      return true;
    }

    default:
      return false;
  }
}
