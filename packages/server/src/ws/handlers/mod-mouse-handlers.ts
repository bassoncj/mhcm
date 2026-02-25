import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser } from "../connections.js";
import { isAdminOrMod, rowToMouseType, rowToMouseMapTier, rowToMouseAlias } from "./handler-utils.js";
import { audit } from "../../audit.js";
import {
  listMouseTypes,
  findMouseTypeById,
  setMouseGlobalTier,
  upsertMouseMapTier,
  deleteMouseMapTier,
  findMouseMapTiersByMouseId,
  findMouseTiersByMapTypeId,
} from "../../db/queries/mouse-types.js";
import {
  getAliasesForMouse,
  addMouseAlias,
  deleteMouseAlias,
  updateMouseAlias,
} from "../../db/queries/mouse-aliases.js";
import {
  createSnipingMouseGroup,
  findSnipingGroupMembers,
  getGroupMemberThumbnails,
  listSnipingGroups,
  setGroupEnabled,
  setGroupArchived,
  hasMouseGroupReferences,
  deleteSnipingMouseGroup,
} from "../../db/queries/sniping-groups.js";
import { generateGroupThumb } from "../../util/group-thumb.js";

export function handleModMouseMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "mod_list_mice": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_list_mice" } });
        return true;
      }
      const { search, tierFilter, limit, offset, includeArchivedGroups, groupsOnly } = message.payload;
      const result = listMouseTypes({ search, tierFilter, limit, offset, includeArchivedGroups, groupsOnly });
      sendToUser(userId, {
        type: "mod_mice_list",
        payload: {
          mice: result.mice.map(rowToMouseType),
          total: result.total,
        },
      });
      return true;
    }

    case "mod_set_mouse_tier": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_mouse_tier" } });
        return true;
      }
      const { mouseId, tier } = message.payload;
      setMouseGlobalTier(mouseId, tier);
      audit("mouse_tier_set", userId, { mouseId, tier });
      const updatedMouse = findMouseTypeById(mouseId);
      if (updatedMouse) {
        const mapTiers = findMouseMapTiersByMouseId(mouseId);
        sendToUser(userId, {
          type: "mod_mouse_updated",
          payload: {
            mouse: rowToMouseType(updatedMouse),
            mapTiers: mapTiers.map(rowToMouseMapTier),
          },
        });
      }
      return true;
    }

    case "mod_set_mouse_map_tier": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_set_mouse_map_tier" } });
        return true;
      }
      const { mouseId: mId, mapTypeId: mtId, tier: mTier } = message.payload;
      upsertMouseMapTier(mId, mtId, mTier);
      audit("mouse_map_tier_set", userId, { mouseId: mId, mapTypeId: mtId, tier: mTier });
      const mouse = findMouseTypeById(mId);
      if (mouse) {
        const mapTiers = findMouseMapTiersByMouseId(mId);
        sendToUser(userId, {
          type: "mod_mouse_updated",
          payload: {
            mouse: rowToMouseType(mouse),
            mapTiers: mapTiers.map(rowToMouseMapTier),
          },
        });
      }
      return true;
    }

    case "mod_delete_mouse_map_tier": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_delete_mouse_map_tier" } });
        return true;
      }
      const { mouseId: delMouseId, mapTypeId: delMapTypeId } = message.payload;
      deleteMouseMapTier(delMouseId, delMapTypeId);
      audit("mouse_map_tier_deleted", userId, { mouseId: delMouseId, mapTypeId: delMapTypeId });
      const delMouse = findMouseTypeById(delMouseId);
      if (delMouse) {
        const delMapTiers = findMouseMapTiersByMouseId(delMouseId);
        sendToUser(userId, {
          type: "mod_mouse_updated",
          payload: {
            mouse: rowToMouseType(delMouse),
            mapTiers: delMapTiers.map(rowToMouseMapTier),
          },
        });
      }
      return true;
    }

    case "mod_get_mouse_map_tiers": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_mouse_map_tiers" } });
        return true;
      }
      const { mouseId: reqMouseId } = message.payload;
      const mapTiersForMouse = findMouseMapTiersByMouseId(reqMouseId);
      sendToUser(userId, {
        type: "mod_mouse_map_tiers",
        payload: {
          mouseId: reqMouseId,
          mapTiers: mapTiersForMouse.map(rowToMouseMapTier),
        },
      });
      return true;
    }

    case "mod_get_map_mouse_tiers": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_map_mouse_tiers" } });
        return true;
      }
      const { mapTypeId: reqMapTypeId } = message.payload;
      const tiers = findMouseTiersByMapTypeId(reqMapTypeId);
      sendToUser(userId, {
        type: "mod_map_mouse_tiers",
        payload: {
          mapTypeId: reqMapTypeId,
          tiers: tiers.map((t) => ({
            mouseTypeId: t.mouseTypeId,
            mouseType: t.mouseType,
            mouseName: t.mouseName,
            mouseThumbnail: t.mouseThumbnail,
            globalTier: t.globalTier as "S" | "A" | "B" | null,
            mapTier: t.mapTier as "S" | "A" | "B",
          })),
        },
      });
      return true;
    }

    case "mod_get_mouse_aliases": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_get_mouse_aliases" } });
        return true;
      }
      const { mouseId: aliasMouseId } = message.payload;
      const aliases = getAliasesForMouse(aliasMouseId);
      sendToUser(userId, {
        type: "mod_mouse_aliases",
        payload: { mouseId: aliasMouseId, aliases: aliases.map(rowToMouseAlias) },
      });
      return true;
    }

    case "mod_add_mouse_alias": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_add_mouse_alias" } });
        return true;
      }
      const { mouseId: addAliasMouseId, alias: newAliasText } = message.payload;
      if (!newAliasText.trim()) {
        sendToUser(userId, { type: "error", payload: { message: "Alias cannot be empty", source: "mod_add_mouse_alias" } });
        return true;
      }
      const added = addMouseAlias(addAliasMouseId, newAliasText);
      if (!added) {
        sendToUser(userId, { type: "error", payload: { message: "Alias already exists for this mouse", source: "mod_add_mouse_alias" } });
        return true;
      }
      audit("mouse_alias_added", userId, { mouseId: addAliasMouseId, alias: newAliasText });
      const aliasesAfterAdd = getAliasesForMouse(addAliasMouseId);
      sendToUser(userId, {
        type: "mod_mouse_aliases",
        payload: { mouseId: addAliasMouseId, aliases: aliasesAfterAdd.map(rowToMouseAlias) },
      });
      return true;
    }

    case "mod_delete_mouse_alias": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_delete_mouse_alias" } });
        return true;
      }
      const { aliasId: delAliasId, mouseId: delAliasMouseId } = message.payload;
      deleteMouseAlias(delAliasId);
      audit("mouse_alias_deleted", userId, { aliasId: delAliasId, mouseId: delAliasMouseId });
      const aliasesAfterDel = getAliasesForMouse(delAliasMouseId);
      sendToUser(userId, {
        type: "mod_mouse_aliases",
        payload: { mouseId: delAliasMouseId, aliases: aliasesAfterDel.map(rowToMouseAlias) },
      });
      return true;
    }

    case "mod_update_mouse_alias": {
      if (!isAdminOrMod(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "mod_update_mouse_alias" } });
        return true;
      }
      const { aliasId: updAliasId, mouseId: updAliasMouseId, alias: updAliasText } = message.payload;
      if (!updAliasText.trim()) {
        sendToUser(userId, { type: "error", payload: { message: "Alias cannot be empty", source: "mod_update_mouse_alias" } });
        return true;
      }
      const updated = updateMouseAlias(updAliasId, updAliasText);
      if (!updated) {
        sendToUser(userId, { type: "error", payload: { message: "Failed to update alias (duplicate or not found)", source: "mod_update_mouse_alias" } });
        return true;
      }
      audit("mouse_alias_updated", userId, { aliasId: updAliasId, mouseId: updAliasMouseId, alias: updAliasText });
      const aliasesAfterUpd = getAliasesForMouse(updAliasMouseId);
      sendToUser(userId, {
        type: "mod_mouse_aliases",
        payload: { mouseId: updAliasMouseId, aliases: aliasesAfterUpd.map(rowToMouseAlias) },
      });
      return true;
    }

    case "mod_list_groups": {
      if (!isAdminOrMod(user)) return true;
      const groupRows = listSnipingGroups({ includeArchived: true });
      const groups = groupRows.map((row) => {
        const members = findSnipingGroupMembers(row.id);
        return {
          id: row.id,
          name: row.name,
          mice: members.map((m) => ({ mouseTypeId: m.mouse_type_id, mouseName: m.name, mouseThumbnail: m.thumbnail })),
          enabled: row.enabled === 1,
          archived: row.archived === 1,
        };
      });
      sendToUser(userId, { type: "mod_group_list", payload: { groups } });
      return true;
    }

    case "mod_create_group": {
      if (!isAdminOrMod(user)) return true;
      const { name: groupName, mouseTypeIds: groupMouseIds } = message.payload;
      const newGroup = createSnipingMouseGroup(groupName, groupMouseIds);
      const members = findSnipingGroupMembers(newGroup.id);
      audit("sniping_group_created", userId, { groupId: newGroup.id, groupName, mouseCount: groupMouseIds.length });
      const memberThumbs = getGroupMemberThumbnails(newGroup.id);
      generateGroupThumb(newGroup.id, memberThumbs).catch((err) =>
        console.warn("[group-thumb] generation failed:", err),
      );
      sendToUser(userId, {
        type: "mod_group_created",
        payload: {
          group: {
            id: newGroup.id,
            name: newGroup.name,
            mice: members.map((m) => ({ mouseTypeId: m.mouse_type_id, mouseName: m.name, mouseThumbnail: m.thumbnail })),
            enabled: newGroup.enabled === 1,
            archived: newGroup.archived === 1,
          },
        },
      });
      return true;
    }

    case "mod_toggle_group": {
      if (!isAdminOrMod(user)) return true;
      setGroupEnabled(message.payload.groupId, message.payload.enabled);
      audit("sniping_group_toggled", userId, { groupId: message.payload.groupId, enabled: message.payload.enabled });
      sendToUser(userId, {
        type: "mod_group_updated",
        payload: { groupId: message.payload.groupId, enabled: message.payload.enabled },
      });
      return true;
    }

    case "mod_archive_group": {
      if (!isAdminOrMod(user)) return true;
      setGroupArchived(message.payload.groupId, true);
      audit("sniping_group_archived", userId, { groupId: message.payload.groupId });
      sendToUser(userId, {
        type: "mod_group_updated",
        payload: { groupId: message.payload.groupId, archived: true },
      });
      return true;
    }

    case "mod_get_group_members": {
      if (!isAdminOrMod(user)) return true;
      const gmMembers = findSnipingGroupMembers(message.payload.groupId);
      sendToUser(userId, {
        type: "mod_group_members",
        payload: {
          groupId: message.payload.groupId,
          members: gmMembers.map((m) => ({ mouseTypeId: m.mouse_type_id, mouseName: m.name, mouseThumbnail: m.thumbnail })),
        },
      });
      return true;
    }

    case "mod_delete_group": {
      if (!isAdminOrMod(user)) return true;
      const { groupId: delGroupId } = message.payload;
      if (hasMouseGroupReferences(delGroupId)) {
        sendToUser(userId, { type: "error", payload: { message: "Cannot delete: group has linked orders, transactions, or price history", source: "mod_delete_group" } });
        return true;
      }
      deleteSnipingMouseGroup(delGroupId);
      audit("sniping_group_deleted", userId, { groupId: delGroupId });
      sendToUser(userId, { type: "mod_group_deleted", payload: { groupId: delGroupId } });
      return true;
    }

    default:
      return false;
  }
}
