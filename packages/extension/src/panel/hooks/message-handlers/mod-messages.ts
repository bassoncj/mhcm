import type { ServerMessage } from "@mhcm/shared";
import {
  modMice,
  modMiceTotal,
  selectedMouseId,
  selectedMouseMapTiers,
  selectedMouseAliases,
  modMiceLoading,
  mapMouseTiers,
  modGroups,
  selectedGroupId,
  selectedGroupMembers,
  modItemGroups,
  selectedItemGroupId,
  selectedItemGroupMembers,
  modItems,
  modItemsTotal,
  modItemClassifications,
  selectedItemId,
  selectedItemMapTiers,
  mapItemTiers,
  modScrolls,
  modRanks,
  selectedItemRiskLocations,
  environmentSearchResults,
  modMapTypes,
  modUsers,
  modSuspensionHistory,
} from "../../signals/moderation.js";
import { allItemTypes } from "../../signals/items.js";

export function handleModMessage(message: ServerMessage): boolean {
  switch (message.type) {
    case "mod_mice_list":
      modMice.value = message.payload.mice;
      modMiceTotal.value = message.payload.total;
      modMiceLoading.value = false;
      return true;

    case "mod_mouse_updated": {
      // Update the mouse in the list
      const updatedMouse = message.payload.mouse;
      modMice.value = modMice.value.map((m) =>
        m.id === updatedMouse.id ? updatedMouse : m,
      );
      // Update map tiers if this is the selected mouse
      if (selectedMouseId.value === updatedMouse.id && message.payload.mapTiers) {
        selectedMouseMapTiers.value = message.payload.mapTiers;
      }
      return true;
    }

    case "mod_mouse_map_tiers": {
      const { mouseId, mapTiers } = message.payload;
      // Update map tiers if this is the selected mouse
      if (selectedMouseId.value === mouseId) {
        selectedMouseMapTiers.value = mapTiers;
      }
      return true;
    }

    case "mod_map_mouse_tiers": {
      const { mapTypeId, tiers } = message.payload;
      mapMouseTiers.value = { ...mapMouseTiers.value, [mapTypeId]: tiers };
      return true;
    }

    case "mod_mouse_aliases": {
      const { mouseId: aliasMouseId, aliases } = message.payload;
      if (selectedMouseId.value === aliasMouseId) {
        selectedMouseAliases.value = aliases;
      }
      return true;
    }

    case "mod_group_list":
      modGroups.value = message.payload.groups;
      return true;

    case "mod_group_created":
      modGroups.value = [...modGroups.value, message.payload.group];
      return true;

    case "mod_group_updated": {
      const { groupId: gid, ...updates } = message.payload;
      modGroups.value = modGroups.value.map((g) =>
        g.id === gid ? { ...g, ...updates } : g,
      );
      // Also update the group in the mixed mice list
      modMice.value = modMice.value.map((m) =>
        m.isGroup && m.id === gid ? { ...m, ...updates } : m,
      );
      return true;
    }

    case "mod_group_members":
      if (selectedGroupId.value === message.payload.groupId) {
        selectedGroupMembers.value = message.payload.members;
      }
      return true;

    case "mod_group_deleted": {
      const { groupId: delGid } = message.payload;
      modGroups.value = modGroups.value.filter((g) => g.id !== delGid);
      modMice.value = modMice.value.filter((m) => !(m.isGroup && m.id === delGid));
      if (selectedGroupId.value === delGid) selectedGroupId.value = null;
      return true;
    }

    case "mod_item_group_list":
      modItemGroups.value = message.payload.groups;
      return true;

    case "mod_item_group_created":
      modItemGroups.value = [...modItemGroups.value, message.payload.group];
      return true;

    case "mod_item_group_updated": {
      const { groupId: igid, ...igUpdates } = message.payload;
      modItemGroups.value = modItemGroups.value.map((g) =>
        g.id === igid ? { ...g, ...igUpdates } : g,
      );
      modItems.value = modItems.value.map((item) =>
        item.isGroup && item.id === igid ? { ...item, ...igUpdates } : item,
      );
      return true;
    }

    case "mod_item_group_members":
      if (selectedItemGroupId.value === message.payload.groupId) {
        selectedItemGroupMembers.value = message.payload.members;
      }
      return true;

    case "mod_item_group_deleted": {
      const { groupId: delIgid } = message.payload;
      modItemGroups.value = modItemGroups.value.filter((g) => g.id !== delIgid);
      modItems.value = modItems.value.filter((item) => !(item.isGroup && item.id === delIgid));
      if (selectedItemGroupId.value === delIgid) selectedItemGroupId.value = null;
      return true;
    }

    case "mod_item_list":
      modItems.value = message.payload.items;
      modItemsTotal.value = message.payload.total;
      if (message.payload.classifications) {
        modItemClassifications.value = message.payload.classifications;
      }
      return true;

    case "mod_item_updated":
      modItems.value = modItems.value.map((item) =>
        item.id === message.payload.item.id ? message.payload.item : item,
      );
      // Also update the main item catalog if loaded
      allItemTypes.value = allItemTypes.value.map((item) =>
        item.id === message.payload.item.id ? message.payload.item : item,
      );
      return true;

    case "mod_item_map_tiers": {
      const { itemId: iid, mapTiers: iMapTiers } = message.payload;
      if (selectedItemId.value === iid) {
        selectedItemMapTiers.value = iMapTiers;
      }
      return true;
    }

    case "mod_map_item_tiers": {
      const { mapTypeId: mitId, tiers: iTiers } = message.payload;
      mapItemTiers.value = { ...mapItemTiers.value, [mitId]: iTiers };
      return true;
    }

    case "mod_item_risk_locations": {
      const { itemTypeId: riskItemId, locations } = message.payload;
      if (selectedItemId.value === riskItemId) {
        selectedItemRiskLocations.value = locations;
      }
      return true;
    }

    case "mod_environment_search_results":
      environmentSearchResults.value = message.payload.environments;
      return true;

    case "mod_scrolls":
      modScrolls.value = message.payload.scrolls;
      return true;

    case "mod_ranks":
      modRanks.value = message.payload.ranks;
      return true;

    case "mod_map_types_list":
      modMapTypes.value = message.payload.mapTypes;
      return true;

    case "mod_users_list":
      modUsers.value = message.payload.users;
      return true;

    case "mod_user_updated": {
      const { userId: updUserId, status: updStatus } = message.payload;
      modUsers.value = modUsers.value.map((u) =>
        u.id === updUserId ? { ...u, status: updStatus } : u,
      );
      return true;
    }

    case "mod_suspension_history":
      modSuspensionHistory.value = { userId: message.payload.userId, suspensions: message.payload.suspensions };
      return true;

    default:
      return false;
  }
}
