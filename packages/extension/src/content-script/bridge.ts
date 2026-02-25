import type {
  ContentToWorkerMessage,
  ExecuteApiCallMessage,
  GameApiMethod,
} from "../shared/messaging.js";
import * as gameApi from "./game-api.js";
import { setXhrLogCallback } from "./game-api.js";

const API_METHODS: Record<GameApiMethod, (...args: any[]) => Promise<any>> = {
  getMapInventory: gameApi.getMapInventory,
  getMapInfo: gameApi.getMapInfo,
  sendInvites: gameApi.sendInvites,
  cancelInvites: gameApi.cancelInvites,
  getReceivedInvites: gameApi.getReceivedInvites,
  acceptInvite: gameApi.acceptInvite,
  transferOwnership: gameApi.transferOwnership,
  leaveMap: gameApi.leaveMap,
  claimChest: gameApi.claimChest,
  transferSupplies: gameApi.transferSupplies,
  getItemQuantity: gameApi.getItemQuantity,
  openChest: gameApi.openChest,
  openScroll: gameApi.openScroll,
  postToCorkBoard: gameApi.postToCorkBoard,
  getHunterProfile: gameApi.getHunterProfile,
  fetchCampPage: gameApi.fetchCampPage,
  fetchPreferencesPage: gameApi.fetchPreferencesPage,
  getMiceEffectiveness: gameApi.getMiceEffectiveness,
  getPlayerEnvironment: gameApi.getPlayerEnvironment,
  fetchMessages: gameApi.fetchMessages,
};

export const bridge = {
  sendToServiceWorker(message: ContentToWorkerMessage): void {
    if (!chrome.runtime?.id) return; // Extension context invalidated (reload pending)
    chrome.runtime.sendMessage(message).catch((err) => {
      console.warn("[mhcm] failed to send to service worker:", err);
    });
  },

  handleServiceWorkerMessage(
    message: ExecuteApiCallMessage,
    sendResponse: (response: any) => void
  ): void {
    if (message.type !== "execute_api_call") {
      sendResponse({ success: false, error: "unknown message type" });
      return;
    }

    const { requestId, method, args } = message.payload;
    const fn = API_METHODS[method];

    if (!fn) {
      sendResponse({ success: false, error: `unknown API method: ${method}` });
      return;
    }

    fn(...args)
      .then((data) => {
        sendResponse({ requestId, success: true, data });
      })
      .catch((err) => {
        sendResponse({
          requestId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  },
};

// Wire up game-api XHR log callback to forward via service worker
setXhrLogCallback((entry) => {
  bridge.sendToServiceWorker(entry);
});
