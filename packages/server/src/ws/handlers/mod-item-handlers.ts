import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser } from "../connections.js";
import { isAdminOrMod, rowToItemType } from "./handler-utils.js";
import { audit } from "../../audit.js";
import {
  findItemTypeById,
  setItemTypeEnabled,
  setItemTypeAlias,
  setItemTypeThumbnail,
  listItemTypesMixed,
  getDistinctClassifications,
  setItemGlobalTier,
  upsertItemMapTier,
  deleteItemMapTier,
  findItemMapTiersByItemId,
  findItemTiersByMapTypeId,
  setItemAlwaysWarn,
  getItemRiskLocations,
  addItemRiskLocation,
  removeItemRiskLocation,
} from "../../db/queries/item-types.js";
import { searchEnvironments, findEnvironmentByType } from "../../db/queries/environments.js";
import { matchItemOrders } from "../../orders/item-matcher.js";
import { broadcastItemOrderBook } from "../../orders/item-book.js";
import {
  createSnipingItemGroup,
  findSnipingItemGroupMembers,
  getItemGroupMemberThumbnails,
  listSnipingItemGroups,
  setItemGroupEnabled,
  setItemGroupArchived,
  hasItemGroupReferences,
  deleteSnipingItemGroup,
} from "../../db/queries/sniping-groups.js";
import { generateGroupThumb } from "../../util/group-thumb.js";

export function handleModItemMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "mod_list_items": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_list_items" } });
        return true;
      }
      const {
        search: itemSearch,
        classifications: itemClassifications,
        limit: itemLimit,
        offset: itemOffset,
        showHidden: itemShowHidden,
        tierFilter: itemTierFilter,
        groupsOnly: itemGroupsOnly,
        includeArchivedGroups: itemIncludeArchived,
      } = message.payload;
      const showHid = !!itemShowHidden;
      const itemResult = listItemTypesMixed({
        search: itemSearch,
        classifications: itemClassifications,
        offset: itemOffset ?? 0,
        limit: itemLimit ?? 50,
        showHidden: showHid,
        tierFilter: itemTierFilter,
        groupsOnly: itemGroupsOnly,
        includeArchivedGroups: itemIncludeArchived,
      });
      const itemClassList = getDistinctClassifications(showHid);
      sendToUser(userId, {
        type: "mod_item_list",
        payload: {
          items: itemResult.items.map(rowToItemType),
          total: itemResult.total,
          classifications: itemClassList,
        },
      });
      return true;
    }

    case "mod_toggle_item": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_toggle_item" } });
        return true;
      }
      const { itemTypeId: toggleItemId, enabled: itemEnabled } = message.payload;
      setItemTypeEnabled(toggleItemId, itemEnabled);
      audit("item_type_toggled", userId, { itemTypeId: toggleItemId, enabled: itemEnabled });
      const toggledItem = findItemTypeById(toggleItemId);
      if (toggledItem) {
        sendToUser(userId, {
          type: "mod_item_updated",
          payload: { item: rowToItemType(toggledItem) },
        });
      }
      if (itemEnabled) {
        queueMicrotask(() => {
          matchItemOrders(toggleItemId);
          broadcastItemOrderBook(toggleItemId);
        });
      }
      return true;
    }

    case "mod_set_item_alias": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_item_alias" } });
        return true;
      }
      const { itemTypeId: aliasItemId, alias: itemAlias } = message.payload;
      setItemTypeAlias(aliasItemId, itemAlias || null);
      audit("item_type_alias_set", userId, { itemTypeId: aliasItemId, alias: itemAlias });
      const aliasedItem = findItemTypeById(aliasItemId);
      if (aliasedItem) {
        sendToUser(userId, {
          type: "mod_item_updated",
          payload: { item: rowToItemType(aliasedItem) },
        });
      }
      return true;
    }

    case "mod_set_item_thumbnail": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_item_thumbnail" } });
        return true;
      }
      const { itemTypeId: thumbItemId, thumbnail: itemThumb } = message.payload;
      setItemTypeThumbnail(thumbItemId, itemThumb || null);
      audit("item_type_thumbnail_set", userId, { itemTypeId: thumbItemId, thumbnail: itemThumb });
      const thumbItem = findItemTypeById(thumbItemId);
      if (thumbItem) {
        sendToUser(userId, {
          type: "mod_item_updated",
          payload: { item: rowToItemType(thumbItem) },
        });
      }
      return true;
    }

    case "mod_set_item_always_warn": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_item_always_warn" } });
        return true;
      }
      const { itemTypeId: awItemId, alwaysWarn } = message.payload;
      setItemAlwaysWarn(awItemId, alwaysWarn);
      audit("settings_changed", userId, { setting: "item_always_warn", itemTypeId: awItemId, alwaysWarn });
      const awItem = findItemTypeById(awItemId);
      if (awItem) {
        sendToUser(userId, {
          type: "mod_item_updated",
          payload: { item: rowToItemType(awItem) },
        });
      }
      return true;
    }

    case "mod_get_item_risk_locations": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_item_risk_locations" } });
        return true;
      }
      const { itemTypeId: rlItemId } = message.payload;
      const locs = getItemRiskLocations(rlItemId);
      sendToUser(userId, {
        type: "mod_item_risk_locations",
        payload: {
          itemTypeId: rlItemId,
          locations: locs.map((l) => {
            const env = findEnvironmentByType(l.environment_type);
            return { environmentType: l.environment_type, environmentName: env?.name ?? l.environment_type };
          }),
        },
      });
      return true;
    }

    case "mod_add_item_risk_location": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_add_item_risk_location" } });
        return true;
      }
      const { itemTypeId: addRlItemId, environmentType: addEnvType } = message.payload;
      addItemRiskLocation(addRlItemId, addEnvType);
      audit("settings_changed", userId, { setting: "item_risk_location_added", itemTypeId: addRlItemId, environmentType: addEnvType });
      const addedLocs = getItemRiskLocations(addRlItemId);
      sendToUser(userId, {
        type: "mod_item_risk_locations",
        payload: {
          itemTypeId: addRlItemId,
          locations: addedLocs.map((l) => {
            const env = findEnvironmentByType(l.environment_type);
            return { environmentType: l.environment_type, environmentName: env?.name ?? l.environment_type };
          }),
        },
      });
      return true;
    }

    case "mod_remove_item_risk_location": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_remove_item_risk_location" } });
        return true;
      }
      const { itemTypeId: rmRlItemId, environmentType: rmEnvType } = message.payload;
      removeItemRiskLocation(rmRlItemId, rmEnvType);
      audit("settings_changed", userId, { setting: "item_risk_location_removed", itemTypeId: rmRlItemId, environmentType: rmEnvType });
      const rmLocs = getItemRiskLocations(rmRlItemId);
      sendToUser(userId, {
        type: "mod_item_risk_locations",
        payload: {
          itemTypeId: rmRlItemId,
          locations: rmLocs.map((l) => {
            const env = findEnvironmentByType(l.environment_type);
            return { environmentType: l.environment_type, environmentName: env?.name ?? l.environment_type };
          }),
        },
      });
      return true;
    }

    case "mod_search_environments": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_search_environments" } });
        return true;
      }
      const { query: envQuery } = message.payload;
      const envResults = searchEnvironments(envQuery);
      sendToUser(userId, {
        type: "mod_environment_search_results",
        payload: { environments: envResults.map((e) => ({ type: e.type, name: e.name })) },
      });
      return true;
    }

    case "mod_set_item_tier": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_item_tier" } });
        return true;
      }
      const { itemId: tierItemId, tier: itemTier } = message.payload;
      setItemGlobalTier(tierItemId, itemTier);
      audit("item_tier_set", userId, { itemTypeId: tierItemId, tier: itemTier });
      const updatedItem = findItemTypeById(tierItemId);
      if (updatedItem) {
        const itemMapTiers = findItemMapTiersByItemId(tierItemId);
        sendToUser(userId, {
          type: "mod_item_updated",
          payload: {
            item: rowToItemType(updatedItem),
            mapTiers: itemMapTiers.map((t) => ({
              itemTypeId: t.item_type_id,
              mapTypeId: t.map_type_id,
              tier: t.tier as "S" | "A" | "B",
            })),
          },
        });
      }
      return true;
    }

    case "mod_set_item_map_tier": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_item_map_tier" } });
        return true;
      }
      const { itemId: imtItemId, mapTypeId: imtMapId, tier: imtTier } = message.payload;
      upsertItemMapTier(imtItemId, imtMapId, imtTier);
      audit("item_map_tier_set", userId, { itemTypeId: imtItemId, mapTypeId: imtMapId, tier: imtTier });
      const imtItem = findItemTypeById(imtItemId);
      if (imtItem) {
        const imtMapTiers = findItemMapTiersByItemId(imtItemId);
        sendToUser(userId, {
          type: "mod_item_updated",
          payload: {
            item: rowToItemType(imtItem),
            mapTiers: imtMapTiers.map((t) => ({
              itemTypeId: t.item_type_id,
              mapTypeId: t.map_type_id,
              tier: t.tier as "S" | "A" | "B",
            })),
          },
        });
      }
      return true;
    }

    case "mod_delete_item_map_tier": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_delete_item_map_tier" } });
        return true;
      }
      const { itemId: delItemId, mapTypeId: delItemMapId } = message.payload;
      deleteItemMapTier(delItemId, delItemMapId);
      audit("item_map_tier_deleted", userId, { itemTypeId: delItemId, mapTypeId: delItemMapId });
      const delItem = findItemTypeById(delItemId);
      if (delItem) {
        const delItemMapTiers = findItemMapTiersByItemId(delItemId);
        sendToUser(userId, {
          type: "mod_item_updated",
          payload: {
            item: rowToItemType(delItem),
            mapTiers: delItemMapTiers.map((t) => ({
              itemTypeId: t.item_type_id,
              mapTypeId: t.map_type_id,
              tier: t.tier as "S" | "A" | "B",
            })),
          },
        });
      }
      return true;
    }

    case "mod_get_item_map_tiers": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_item_map_tiers" } });
        return true;
      }
      const { itemId: reqItemId } = message.payload;
      const itemMapTiersForItem = findItemMapTiersByItemId(reqItemId);
      sendToUser(userId, {
        type: "mod_item_map_tiers",
        payload: {
          itemId: reqItemId,
          mapTiers: itemMapTiersForItem.map((t) => ({
            itemTypeId: t.item_type_id,
            mapTypeId: t.map_type_id,
            tier: t.tier as "S" | "A" | "B",
          })),
        },
      });
      return true;
    }

    case "mod_get_map_item_tiers": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_map_item_tiers" } });
        return true;
      }
      const { mapTypeId: reqItemMapTypeId } = message.payload;
      const itemTiers = findItemTiersByMapTypeId(reqItemMapTypeId);
      sendToUser(userId, {
        type: "mod_map_item_tiers",
        payload: {
          mapTypeId: reqItemMapTypeId,
          tiers: itemTiers.map((t) => ({
            itemTypeId: t.itemTypeId,
            itemType: t.itemType,
            itemName: t.itemName,
            itemThumbnail: t.itemThumbnail,
            globalTier: t.globalTier as "S" | "A" | "B" | null,
            mapTier: t.mapTier as "S" | "A" | "B",
          })),
        },
      });
      return true;
    }

    case "mod_list_item_groups": {
      if (!isAdminOrMod(user)) return true;
      const itemGroupRows = listSnipingItemGroups({ includeArchived: true });
      const itemGroups = itemGroupRows.map((row) => {
        const members = findSnipingItemGroupMembers(row.id);
        return {
          id: row.id,
          name: row.name,
          items: members.map((m) => ({ itemTypeId: m.item_type_id, itemName: m.name, itemThumbnail: m.thumbnail })),
          enabled: row.enabled === 1,
          archived: row.archived === 1,
        };
      });
      sendToUser(userId, { type: "mod_item_group_list", payload: { groups: itemGroups } });
      return true;
    }

    case "mod_create_item_group": {
      if (!isAdminOrMod(user)) return true;
      const { name: igName, itemTypeIds: igItemIds } = message.payload;
      const newItemGroup = createSnipingItemGroup(igName, igItemIds);
      const igMembers = findSnipingItemGroupMembers(newItemGroup.id);
      audit("item_group_created", userId, { groupId: newItemGroup.id, groupName: igName, itemCount: igItemIds.length });
      const igThumbs = getItemGroupMemberThumbnails(newItemGroup.id);
      generateGroupThumb(newItemGroup.id, igThumbs, "item").catch((err) =>
        console.warn("[group-thumb] item group generation failed:", err),
      );
      sendToUser(userId, {
        type: "mod_item_group_created",
        payload: {
          group: {
            id: newItemGroup.id,
            name: newItemGroup.name,
            items: igMembers.map((m) => ({ itemTypeId: m.item_type_id, itemName: m.name, itemThumbnail: m.thumbnail })),
            enabled: newItemGroup.enabled === 1,
            archived: newItemGroup.archived === 1,
          },
        },
      });
      return true;
    }

    case "mod_toggle_item_group": {
      if (!isAdminOrMod(user)) return true;
      setItemGroupEnabled(message.payload.groupId, message.payload.enabled);
      audit("item_group_toggled", userId, { groupId: message.payload.groupId, enabled: message.payload.enabled });
      sendToUser(userId, {
        type: "mod_item_group_updated",
        payload: { groupId: message.payload.groupId, enabled: message.payload.enabled },
      });
      return true;
    }

    case "mod_archive_item_group": {
      if (!isAdminOrMod(user)) return true;
      setItemGroupArchived(message.payload.groupId, true);
      audit("item_group_archived", userId, { groupId: message.payload.groupId });
      sendToUser(userId, {
        type: "mod_item_group_updated",
        payload: { groupId: message.payload.groupId, archived: true },
      });
      return true;
    }

    case "mod_get_item_group_members": {
      if (!isAdminOrMod(user)) return true;
      const igmMembers = findSnipingItemGroupMembers(message.payload.groupId);
      sendToUser(userId, {
        type: "mod_item_group_members",
        payload: {
          groupId: message.payload.groupId,
          members: igmMembers.map((m) => ({ itemTypeId: m.item_type_id, itemName: m.name, itemThumbnail: m.thumbnail })),
        },
      });
      return true;
    }

    case "mod_delete_item_group": {
      if (!isAdminOrMod(user)) return true;
      const { groupId: delItemGroupId } = message.payload;
      if (hasItemGroupReferences(delItemGroupId)) {
        sendToUser(userId, { type: "error", payload: { message: "Cannot delete: group has linked orders, transactions, or price history", source: "mod_delete_item_group" } });
        return true;
      }
      deleteSnipingItemGroup(delItemGroupId);
      audit("item_group_deleted", userId, { groupId: delItemGroupId });
      sendToUser(userId, { type: "mod_item_group_deleted", payload: { groupId: delItemGroupId } });
      return true;
    }

    default:
      return false;
  }
}
