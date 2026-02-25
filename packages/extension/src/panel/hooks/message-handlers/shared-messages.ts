import type { ServerMessage } from "@mhcm/shared";
import { getPlatform } from "../../platform/index.js";
import { mapTypes, mapTypeStats } from "../../signals/slots.js";
import { mhAccount, mhLinkPending, mhLinkError, mhLinkVerifyCode, mhLinkVerifying, gameSettingsValid, gameSettings } from "../../signals/auth.js";
import { sbBalance } from "../../signals/game-state.js";
import { setNotificationPrefs } from "../../signals/notifications.js";
import { allMapTypes } from "../../signals/maps.js";
import { availableSb } from "../../signals/game-state.js";
import { orderError } from "../../signals/slots.js";
import { snipingError } from "../../signals/sniping.js";
import { showToast } from "../../signals/toast.js";
import { marketBetaConfig, isBetaTester, hasPendingBetaRequest } from "../../signals/beta.js";
import { marketEnabledConfig, syncingKeys } from "../../signals/admin.js";
import { activeAlert, versionOutdated } from "../../signals/alerts.js";
import { onboardingComplete, onboardingTasks } from "../../signals/onboarding.js";
import { rtConfirmPrompt } from "../../signals/rt-confirm.js";
import { sendToWorker } from "../useServiceWorker.js";

export function handleSharedMessage(message: ServerMessage): boolean {
  switch (message.type) {
    case "map_types":
      mapTypes.value = message.payload.mapTypes;
      allMapTypes.value = message.payload.mapTypes; // Also update maps marketplace signal
      if (message.payload.stats) {
        mapTypeStats.value = message.payload.stats;
      }
      return true;

    case "mh_link_verify_code":
      mhLinkVerifyCode.value = message.payload.code;
      mhLinkPending.value = false;
      mhLinkError.value = null;
      return true;

    case "mh_link_reset":
      mhAccount.value = null;
      mhLinkVerifyCode.value = null;
      mhLinkVerifying.value = false;
      mhLinkPending.value = false;
      mhLinkError.value = null;
      getPlatform().removeStorage("mhcm_auth_mh_account");
      return true;

    case "mh_link_result":
      if (message.payload.success && message.payload.mhAccount) {
        mhAccount.value = {
          userId: message.payload.mhAccount.userId,
          mhUserId: message.payload.mhAccount.mhUserId,
          mhSnUserId: message.payload.mhAccount.mhSnUserId,
          verified: true,
          verifiedAt: message.payload.mhAccount.verifiedAt,
        };
        getPlatform().setStorage("mhcm_auth_mh_account", mhAccount.value);
        mhLinkError.value = null;
        mhLinkVerifyCode.value = null;
      } else {
        mhLinkError.value = {
          message: message.payload.error ?? "Failed to link account",
          code: message.payload.code,
        };
      }
      mhLinkPending.value = false;
      mhLinkVerifying.value = false;
      return true;

    case "notification_prefs":
      setNotificationPrefs(message.payload);
      // Also sync to service worker state so it uses these prefs for notifications
      sendToWorker({ type: "set_notification_prefs", payload: message.payload });
      return true;

    case "available_sb":
      // Calculate available SB: total balance (from game API) - committed (from server)
      if (sbBalance.value != null) {
        availableSb.value = sbBalance.value - message.payload.committedSb;
      } else {
        availableSb.value = null;
      }
      return true;

    case "game_settings_invalid":
      gameSettingsValid.value = false;
      gameSettings.value = message.payload;
      return true;

    case "market_beta_config":
      marketBetaConfig.value = message.payload;
      return true;

    case "market_enabled_config":
      marketEnabledConfig.value = message.payload;
      return true;

    case "beta_tester_status":
      isBetaTester.value = message.payload.isBetaTester;
      hasPendingBetaRequest.value = message.payload.hasPendingRequest;
      return true;

    case "beta_applied":
      hasPendingBetaRequest.value = true;
      return true;

    case "active_alert":
      activeAlert.value = message.payload;
      return true;

    case "version_outdated":
      versionOutdated.value = message.payload;
      return true;

    case "onboarding_status":
      onboardingComplete.value = message.payload.complete;
      onboardingTasks.value = message.payload.tasks;
      return true;

    case "market_disabled_notice":
      showToast(message.payload.message, "warn", 0, true);
      return true;

    case "rt_manual_confirm_prompt":
      rtConfirmPrompt.value = {
        transactionId: message.payload.transactionId,
        sellerSnUserId: message.payload.sellerSnUserId,
        sellerName: message.payload.sellerUsername,
      };
      return true;

    case "error": {
      orderError.value = message.payload.message;
      snipingError.value = message.payload.message;
      setTimeout(() => {
        orderError.value = null;
        snipingError.value = null;
      }, 5000);
      showToast(message.payload.message, "error");
      // Clear sync spinner on sync failure (source = "admin_sync_*")
      const src = (message.payload as { source?: string }).source;
      if (src?.startsWith("admin_sync_")) {
        const key = src.replace("admin_sync_", "");
        const next = new Set(syncingKeys.value);
        next.delete(key);
        syncingKeys.value = next;
      }
      return true;
    }

    default:
      return false;
  }
}
