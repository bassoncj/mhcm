import type { ServerMessage } from "@mhcm/shared";
import { allowAnyGoalCount, xhrLoggingEnabled, betaRequests, syncCounts, syncingKeys, marketEnabledConfig, demoMarketVisible, rateLimitConfig, adminRankOverride, riskCheckTimeoutSeconds, verificationMethod, onboardingStepConfigs, onboardingStats, drainProgress, adminUsers, adminAuditLog, adminDemoStatus, adminBetaStatus } from "../../signals/admin.js";
import { playerTitleId, realPlayerTitleId } from "../../signals/game-state.js";
import { adminAlerts, versionAlertEnabled } from "../../signals/alerts.js";
import { showToast } from "../../signals/toast.js";
import { wsSend } from "../useServiceWorker.js";

function clearSyncKey(key: string) {
  const next = new Set(syncingKeys.value);
  next.delete(key);
  syncingKeys.value = next;
}

export function handleAdminMessage(message: ServerMessage): boolean {
  switch (message.type) {
    case "admin_settings":
      allowAnyGoalCount.value = message.payload.allowAnyGoalCount;
      xhrLoggingEnabled.value = message.payload.xhrLoggingEnabled;
      if (message.payload.syncCounts) syncCounts.value = message.payload.syncCounts;
      if (message.payload.marketEnabled) marketEnabledConfig.value = message.payload.marketEnabled;
      if (message.payload.rateLimits) rateLimitConfig.value = message.payload.rateLimits;
      if (message.payload.riskCheckTimeoutSeconds != null) {
        riskCheckTimeoutSeconds.value = message.payload.riskCheckTimeoutSeconds;
      }
      if (message.payload.verificationMethod) {
        verificationMethod.value = message.payload.verificationMethod;
      }
      if (message.payload.demoMarketVisible) demoMarketVisible.value = message.payload.demoMarketVisible;
      if (message.payload.rankOverride !== undefined) {
        adminRankOverride.value = message.payload.rankOverride ?? null;
        // Override local playerTitleId so selectors respond immediately
        if (message.payload.rankOverride != null) {
          playerTitleId.value = message.payload.rankOverride;
        } else {
          // Restore real rank when clearing override
          playerTitleId.value = realPlayerTitleId.value;
        }
      }
      return true;

    case "admin_maps_synced":
      clearSyncKey("maps");
      showToast(`Map types synced (${message.payload.count} total)`, "success");
      return true;

    case "admin_mice_synced":
      clearSyncKey("mice");
      showToast(`Mouse types synced (${message.payload.count} total)`, "success");
      return true;

    case "admin_environments_synced":
      clearSyncKey("environments");
      showToast(`Environments synced (${message.payload.added} added)`, "success");
      return true;

    case "admin_beta_requests":
      betaRequests.value = message.payload.requests;
      return true;

    case "admin_beta_request_received":
      betaRequests.value = [message.payload.request, ...betaRequests.value];
      return true;

    case "admin_alerts":
      adminAlerts.value = message.payload.alerts;
      versionAlertEnabled.value = message.payload.versionAlertEnabled;
      return true;

    case "demo_market_config":
      demoMarketVisible.value = message.payload;
      return true;

    case "onboarding_config":
      onboardingStepConfigs.value = message.payload.stepConfigs;
      return true;

    case "onboarding_stats":
      onboardingStats.value = message.payload;
      return true;

    case "admin_drain_progress":
      drainProgress.value = message.payload;
      return true;

    case "admin_users_list":
      adminUsers.value = message.payload.users;
      return true;

    case "admin_user": {
      const { user: updUser } = message.payload;
      const idx = adminUsers.value.findIndex((u) => u.id === updUser.id);
      if (idx >= 0) {
        const next = [...adminUsers.value];
        next[idx] = updUser;
        adminUsers.value = next;
      } else {
        adminUsers.value = [...adminUsers.value, updUser];
      }
      return true;
    }

    case "admin_audit_log":
      adminAuditLog.value = message.payload;
      return true;

    case "admin_demo_status":
      adminDemoStatus.value = message.payload;
      return true;

    case "admin_beta_status":
      adminBetaStatus.value = message.payload;
      return true;

    case "admin_items_synced":
      clearSyncKey("items");
      wsSend({ type: "mod_list_items", payload: {} });
      wsSend({ type: "get_item_types" });
      return true;

    case "admin_scrolls_synced":
      clearSyncKey("scrolls");
      wsSend({ type: "mod_get_scrolls", payload: { search: "" } });
      return true;

    case "admin_ranks_synced":
      clearSyncKey("ranks");
      wsSend({ type: "mod_get_ranks" });
      return true;

    default:
      return false;
  }
}
