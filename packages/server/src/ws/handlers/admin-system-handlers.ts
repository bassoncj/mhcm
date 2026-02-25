import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser, broadcast, broadcastToAdmins, getOnlineUserIds, getConnection } from "../connections.js";
import { isAdmin, isUserBetaEligible } from "./handler-utils.js";
import { audit } from "../../audit.js";
import {
  getSettings,
  setAllowAnyGoalCount,
  setXhrLoggingEnabled,
  setMarketEnabled,
  getMarketEnabledConfig,
  getRateLimitSettings,
  setRateLimitSettings,
  getAdminRankOverride,
  setAdminRankOverride,
  getRiskCheckTimeoutSeconds,
  setRiskCheckTimeoutSeconds,
  getVerificationMethod,
  setVerificationMethod,
  getOnboardingStepConfigs,
  setOnboardingStepEnabled,
  isVersionAlertEnabled,
  setVersionAlertEnabled,
} from "../../settings.js";
import { incrementalSyncItemTypes } from "../../db/seed-item-types.js";
import { incrementalSyncScrolls } from "../../db/seed-scrolls.js";
import { incrementalSyncRanks } from "../../db/seed-ranks.js";
import { incrementalSyncEnvironments } from "../../db/seed-environments.js";
import { seedMapTypes } from "../../db/seed-map-types.js";
import { seedMouseTypes } from "../../db/seed-mouse-types.js";
import { findMHAccountByUserId, deleteMHAccount } from "../../db/queries/mh-accounts.js";
import { getSyncCounts } from "../../db/queries/sync-counts.js";
import {
  getOnboardingCompletionStats,
  isUserOnboardingComplete,
  getAllOnboardingTasks,
} from "../../db/queries/onboarding.js";
import {
  markUserOnboardingIncomplete,
  markUserOnboardingComplete,
  getUnfinishedOnboardingUserIds,
} from "../connections.js";
import { getDemoMarketConfig } from "../../demo/demo-mode.js";
import { startDrain, cancelDrain, forceDrain, getDrainProgress } from "../../drain.js";
import { closeDb } from "../../db/connection.js";
import {
  createAlert,
  updateAlert,
  deleteAlert,
  listAllAlerts,
  getUpcomingAlertRows,
  getUnacknowledgedAlert,
  hasAcknowledgedAlert,
  type AdminAlertRow,
} from "../../db/queries/admin-alerts.js";
import { findPendingOrderMapTypes } from "../../db/queries/slot-orders.js";
import { tryMatch } from "../../orders/slot-matcher.js";
import { findPendingSnipingOrderTargets } from "../../db/queries/sniping-orders.js";
import { trySnipingMatch } from "../../orders/sniping-matcher.js";
import { findPendingItemOrderTypes } from "../../db/queries/item-orders.js";
import { matchItemOrders } from "../../orders/item-matcher.js";
import { findPendingMapOrderTypes } from "../../db/queries/map-orders.js";
import { matchMapOrders } from "../../orders/map-matcher.js";

export function buildAdminSettingsPayload(adminUserId?: number) {
  const s = getSettings();
  return {
    allowAnyGoalCount: s.allowAnyGoalCount,
    xhrLoggingEnabled: s.xhrLoggingEnabled,
    syncCounts: getSyncCounts(),
    marketEnabled: getMarketEnabledConfig(),
    rateLimits: getRateLimitSettings(),
    rankOverride: adminUserId != null ? getAdminRankOverride(adminUserId) : undefined,
    riskCheckTimeoutSeconds: getRiskCheckTimeoutSeconds(),
    demoMarketVisible: getDemoMarketConfig(),
    verificationMethod: getVerificationMethod(),
  };
}

const scheduledAlerts = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleAlertBroadcast(alert: Pick<AdminAlertRow, "id" | "alert_type" | "starts_at">): void {
  const delay = new Date(alert.starts_at).getTime() - Date.now();
  if (delay <= 0) return;
  const handle = setTimeout(() => {
    scheduledAlerts.delete(alert.id);
    broadcastAlertToEligibleUsers(alert.id, alert.alert_type);
  }, delay);
  scheduledAlerts.set(alert.id, handle);
}

function cancelScheduledAlert(alertId: number): void {
  const handle = scheduledAlerts.get(alertId);
  if (handle) {
    clearTimeout(handle);
    scheduledAlerts.delete(alertId);
  }
}

function broadcastAlertToEligibleUsers(alertId: number, alertType: string): void {
  for (const onlineUserId of getOnlineUserIds()) {
    const conn = getConnection(onlineUserId);
    if (!conn) continue;
    if (alertType === "beta" && !isUserBetaEligible(onlineUserId, conn.user.role)) continue;
    if (hasAcknowledgedAlert(onlineUserId, alertId)) continue;
    const isBeta = isUserBetaEligible(onlineUserId, conn.user.role);
    const pending = getUnacknowledgedAlert(onlineUserId, isBeta);
    if (pending) {
      sendToUser(onlineUserId, { type: "active_alert", payload: pending });
    }
  }
}

/** Schedule all upcoming (future) alerts. Called on server startup. */
export function scheduleUpcomingAlerts(): void {
  const upcoming = getUpcomingAlertRows();
  for (const row of upcoming) {
    scheduleAlertBroadcast(row);
  }
  if (upcoming.length > 0) {
    console.log(`[alerts] scheduled ${upcoming.length} upcoming alert(s)`);
  }
}

export function handleAdminSystemMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "admin_get_settings": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_get_settings" } });
        return true;
      }
      sendToUser(userId, {
        type: "admin_settings",
        payload: buildAdminSettingsPayload(userId),
      });
      return true;
    }

    case "admin_set_allow_any_goal_count": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_allow_any_goal_count" } });
        return true;
      }
      const { value } = message.payload;
      setAllowAnyGoalCount(value);
      audit("settings_changed", userId, { setting: "allowAnyGoalCount", value });
      sendToUser(userId, {
        type: "admin_settings",
        payload: buildAdminSettingsPayload(userId),
      });
      return true;
    }

    case "admin_graceful_restart": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_graceful_restart" } });
        return true;
      }
      audit("server_drain_started", userId);
      startDrain(
        (progress) => {
          broadcastToAdmins({
            type: "admin_drain_progress",
            payload: progress,
          });
        },
        () => {
          audit("server_drain_completed", userId);
          console.log("[mhcm-server] admin-triggered graceful restart – drain complete");
          closeDb();
          process.exit(0);
        },
      );
      const progress = getDrainProgress();
      broadcastToAdmins({
        type: "admin_drain_progress",
        payload: progress,
      });
      return true;
    }

    case "admin_force_restart": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_force_restart" } });
        return true;
      }
      const progress = getDrainProgress();
      audit("server_drain_forced", userId, { remaining: progress.remaining });
      console.log("[mhcm-server] admin-triggered force restart");
      forceDrain(() => {
        closeDb();
        process.exit(0);
      });
      return true;
    }

    case "admin_cancel_restart": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_cancel_restart" } });
        return true;
      }
      const cancelled = cancelDrain();
      if (cancelled) {
        audit("server_drain_cancelled", userId);
        broadcastToAdmins({
          type: "admin_drain_progress",
          payload: { draining: false, remaining: 0, elapsed: 0 },
        });
      }
      return true;
    }

    case "admin_set_xhr_logging": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_xhr_logging" } });
        return true;
      }
      const { enabled: xhrEnabled } = message.payload;
      setXhrLoggingEnabled(xhrEnabled);
      audit("settings_changed", userId, { setting: "xhrLoggingEnabled", value: xhrEnabled });
      broadcast({ type: "xhr_logging_state", payload: { enabled: xhrEnabled } });
      sendToUser(userId, {
        type: "admin_settings",
        payload: buildAdminSettingsPayload(userId),
      });
      return true;
    }

    case "admin_sync_items": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_sync_items" } });
        return true;
      }
      incrementalSyncItemTypes()
        .then((added) => {
          audit("item_types_synced", userId, { added });
          sendToUser(userId, {
            type: "admin_items_synced",
            payload: { added },
          });
          sendToUser(userId, {
            type: "admin_settings",
            payload: buildAdminSettingsPayload(userId),
          });
        })
        .catch((err) => {
          sendToUser(userId, {
            type: "error",
            payload: { message: `Item sync failed: ${(err as Error).message}`, source: "admin_sync_items" },
          });
        });
      return true;
    }

    case "admin_sync_scrolls": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_sync_scrolls" } });
        return true;
      }
      incrementalSyncScrolls()
        .then((added) => {
          audit("scrolls_synced", userId, { added });
          sendToUser(userId, {
            type: "admin_scrolls_synced",
            payload: { added },
          });
          sendToUser(userId, {
            type: "admin_settings",
            payload: buildAdminSettingsPayload(userId),
          });
        })
        .catch((err) => {
          sendToUser(userId, {
            type: "error",
            payload: { message: `Scroll sync failed: ${(err as Error).message}`, source: "admin_sync_scrolls" },
          });
        });
      return true;
    }

    case "admin_sync_ranks": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_sync_ranks" } });
        return true;
      }
      const mhAccount = findMHAccountByUserId(userId);
      if (!mhAccount) {
        sendToUser(userId, {
          type: "error",
          payload: { message: "MH account not linked", source: "admin_sync_ranks" },
        });
        return true;
      }
      incrementalSyncRanks("")
        .then((added) => {
          audit("ranks_synced", userId, { added });
          sendToUser(userId, {
            type: "admin_ranks_synced",
            payload: { added },
          });
          sendToUser(userId, {
            type: "admin_settings",
            payload: buildAdminSettingsPayload(userId),
          });
        })
        .catch((err) => {
          sendToUser(userId, {
            type: "error",
            payload: { message: `Rank sync failed: ${(err as Error).message}`, source: "admin_sync_ranks" },
          });
        });
      return true;
    }

    case "admin_get_alerts": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_get_alerts" } });
        return true;
      }
      sendToUser(userId, {
        type: "admin_alerts",
        payload: { alerts: listAllAlerts(), versionAlertEnabled: isVersionAlertEnabled() },
      });
      return true;
    }

    case "admin_create_alert": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_create_alert" } });
        return true;
      }
      const { message: alertMsg, alertType, startsAt: rawStart, endsAt: rawEnd } = message.payload;
      const startsAt = rawStart.replace("T", " ");
      const endsAt = rawEnd.replace("T", " ");
      const newAlert = createAlert(alertMsg, alertType, startsAt, endsAt, userId);
      audit("alert_created", userId, { alertId: newAlert.id, alertType });
      sendToUser(userId, {
        type: "admin_alerts",
        payload: { alerts: listAllAlerts(), versionAlertEnabled: isVersionAlertEnabled() },
      });
      const now = Date.now();
      const startsMs = new Date(startsAt).getTime();
      const endsMs = new Date(endsAt).getTime();
      if (startsMs <= now && endsMs >= now) {
        broadcastAlertToEligibleUsers(newAlert.id, alertType);
      } else if (startsMs > now) {
        scheduleAlertBroadcast({ id: newAlert.id, alert_type: alertType, starts_at: startsAt });
      }
      return true;
    }

    case "admin_update_alert": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_update_alert" } });
        return true;
      }
      const { alertId: updateId, message: updateMsg, alertType: updateType, startsAt: rawUpdateStart, endsAt: rawUpdateEnd } = message.payload;
      const updateStart = rawUpdateStart.replace("T", " ");
      const updateEnd = rawUpdateEnd.replace("T", " ");
      const updated = updateAlert(updateId, updateMsg, updateType, updateStart, updateEnd);
      if (!updated) {
        sendToUser(userId, { type: "error", payload: { message: "Alert not found", source: "admin_update_alert" } });
        return true;
      }
      audit("alert_updated", userId, { alertId: updateId, alertType: updateType });
      cancelScheduledAlert(updateId);
      const nowUpd = Date.now();
      const startsUpd = new Date(updateStart).getTime();
      const endsUpd = new Date(updateEnd).getTime();
      if (startsUpd <= nowUpd && endsUpd >= nowUpd) {
        broadcastAlertToEligibleUsers(updateId, updateType);
      } else if (startsUpd > nowUpd) {
        scheduleAlertBroadcast({ id: updateId, alert_type: updateType, starts_at: updateStart });
      }
      sendToUser(userId, {
        type: "admin_alerts",
        payload: { alerts: listAllAlerts(), versionAlertEnabled: isVersionAlertEnabled() },
      });
      return true;
    }

    case "admin_delete_alert": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_delete_alert" } });
        return true;
      }
      const { alertId: deleteId } = message.payload;
      cancelScheduledAlert(deleteId);
      const deleted = deleteAlert(deleteId);
      if (!deleted) {
        sendToUser(userId, { type: "error", payload: { message: "Alert not found", source: "admin_delete_alert" } });
        return true;
      }
      audit("alert_deleted", userId, { alertId: deleteId });
      sendToUser(userId, {
        type: "admin_alerts",
        payload: { alerts: listAllAlerts(), versionAlertEnabled: isVersionAlertEnabled() },
      });
      return true;
    }

    case "admin_set_version_alert": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_version_alert" } });
        return true;
      }
      const { enabled: versionEnabled } = message.payload;
      setVersionAlertEnabled(versionEnabled);
      audit("version_alert_toggled", userId, { enabled: versionEnabled });
      sendToUser(userId, {
        type: "admin_alerts",
        payload: { alerts: listAllAlerts(), versionAlertEnabled: versionEnabled },
      });
      return true;
    }

    case "admin_sync_maps": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_sync_maps" } });
        return true;
      }
      seedMapTypes()
        .then(() => {
          const counts = getSyncCounts();
          audit("map_types_synced", userId, { count: counts.maps });
          sendToUser(userId, {
            type: "admin_maps_synced",
            payload: { count: counts.maps },
          });
          sendToUser(userId, {
            type: "admin_settings",
            payload: buildAdminSettingsPayload(userId),
          });
        })
        .catch((err) => {
          sendToUser(userId, {
            type: "error",
            payload: { message: `Map sync failed: ${(err as Error).message}`, source: "admin_sync_maps" },
          });
        });
      return true;
    }

    case "admin_sync_mice": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_sync_mice" } });
        return true;
      }
      seedMouseTypes()
        .then(() => {
          const counts = getSyncCounts();
          audit("mouse_types_synced", userId, { count: counts.mice });
          sendToUser(userId, {
            type: "admin_mice_synced",
            payload: { count: counts.mice },
          });
          sendToUser(userId, {
            type: "admin_settings",
            payload: buildAdminSettingsPayload(userId),
          });
        })
        .catch((err) => {
          sendToUser(userId, {
            type: "error",
            payload: { message: `Mouse sync failed: ${(err as Error).message}`, source: "admin_sync_mice" },
          });
        });
      return true;
    }

    case "admin_sync_environments": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_sync_environments" } });
        return true;
      }
      incrementalSyncEnvironments()
        .then((added) => {
          audit("environments_synced", userId, { added });
          sendToUser(userId, {
            type: "admin_environments_synced",
            payload: { added },
          });
          sendToUser(userId, {
            type: "admin_settings",
            payload: buildAdminSettingsPayload(userId),
          });
        })
        .catch((err) => {
          sendToUser(userId, {
            type: "error",
            payload: { message: `Environment sync failed: ${(err as Error).message}`, source: "admin_sync_environments" },
          });
        });
      return true;
    }

    case "admin_set_market_enabled": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_market_enabled" } });
        return true;
      }
      const { market, enabled } = message.payload;
      setMarketEnabled(market, enabled);
      audit("market_enabled_toggled", userId, { market, enabled });
      broadcast({ type: "market_enabled_config", payload: getMarketEnabledConfig() });
      return true;
    }

    case "admin_set_rate_limits": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_rate_limits" } });
        return true;
      }
      const { rateLimits } = message.payload;
      setRateLimitSettings(rateLimits);
      audit("settings_changed", userId, { setting: "rateLimits", rateLimits });
      sendToUser(userId, {
        type: "admin_settings",
        payload: buildAdminSettingsPayload(userId),
      });
      return true;
    }

    case "admin_set_rank_override": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_rank_override" } });
        return true;
      }
      const { rankId } = message.payload;
      setAdminRankOverride(userId, rankId ?? null);
      sendToUser(userId, {
        type: "admin_settings",
        payload: buildAdminSettingsPayload(userId),
      });
      return true;
    }

    case "admin_set_risk_check_timeout": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_risk_check_timeout" } });
        return true;
      }
      const { seconds } = message.payload;
      setRiskCheckTimeoutSeconds(seconds);
      audit("settings_changed", userId, { setting: "riskCheckTimeoutSeconds", value: seconds });
      sendToUser(userId, {
        type: "admin_settings",
        payload: buildAdminSettingsPayload(userId),
      });
      return true;
    }

    case "admin_set_verification_method": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_verification_method" } });
        return true;
      }
      const { method: vm } = message.payload;
      if (vm !== "service_account" && vm !== "proxy_user") return true;
      setVerificationMethod(vm);
      audit("settings_changed", userId, { setting: "verificationMethod", value: vm });
      sendToUser(userId, {
        type: "admin_settings",
        payload: buildAdminSettingsPayload(userId),
      });
      return true;
    }

    case "admin_set_onboarding_step_enabled": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_onboarding_step_enabled" } });
        return true;
      }
      const { stepId: obStepId, enabled: obEnabled } = message.payload;
      setOnboardingStepEnabled(obStepId, obEnabled);
      audit("settings_changed", userId, { setting: `onboarding_step_${obStepId}`, value: obEnabled });

      const newlyUnblocked: number[] = [];
      for (const onlineId of getOnlineUserIds()) {
        const wasIncomplete = getUnfinishedOnboardingUserIds().has(onlineId);
        const complete = isUserOnboardingComplete(onlineId);
        if (complete) {
          markUserOnboardingComplete(onlineId);
        } else {
          markUserOnboardingIncomplete(onlineId);
        }
        sendToUser(onlineId, {
          type: "onboarding_status",
          payload: { complete, tasks: getAllOnboardingTasks(onlineId) },
        });
        if (wasIncomplete && complete) {
          newlyUnblocked.push(onlineId);
        }
      }

      broadcast({ type: "onboarding_config", payload: { stepConfigs: getOnboardingStepConfigs() } });

      for (const uid of newlyUnblocked) {
        const orderMapTypes = findPendingOrderMapTypes(uid);
        for (const mapTypeId of orderMapTypes) {
          queueMicrotask(() => tryMatch(mapTypeId));
        }
        const snipingTargets = findPendingSnipingOrderTargets(uid);
        for (const target of snipingTargets) {
          queueMicrotask(() => trySnipingMatch(target));
        }
        const itemTypes = findPendingItemOrderTypes(uid);
        for (const itemTypeId of itemTypes) {
          queueMicrotask(() => matchItemOrders(itemTypeId));
        }
        const mapOrderTypes = findPendingMapOrderTypes(uid);
        for (const { map_type_id, mode } of mapOrderTypes) {
          queueMicrotask(() => matchMapOrders(map_type_id, mode));
        }
      }
      return true;
    }

    case "admin_get_onboarding_stats": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_get_onboarding_stats" } });
        return true;
      }
      const stats = getOnboardingCompletionStats();
      sendToUser(userId, {
        type: "onboarding_stats",
        payload: stats,
      });
      sendToUser(userId, {
        type: "onboarding_config",
        payload: { stepConfigs: getOnboardingStepConfigs() },
      });
      return true;
    }

    case "admin_reset_mh_link": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_reset_mh_link" } });
        return true;
      }
      const targetUserId = message.payload.targetUserId;
      const targetAccount = findMHAccountByUserId(targetUserId);
      if (!targetAccount) {
        sendToUser(userId, { type: "error", payload: { message: "User has no MH account linked", source: "admin_reset_mh_link" } });
        return true;
      }
      deleteMHAccount(targetUserId);
      audit("mh_link_reset", userId, { targetUserId, mhUserId: targetAccount.mh_user_id });
      sendToUser(userId, { type: "admin_settings", payload: buildAdminSettingsPayload(userId) });
      const targetConn = getConnection(targetUserId);
      if (targetConn) {
        targetConn.ws.close(4001, "MH account link reset");
      }
      return true;
    }

    default:
      return false;
  }
}
