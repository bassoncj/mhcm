import { bridge } from "./bridge.js";
import { fetchLatestJournalEntryId, setJournalEntryId, setXhrLoggingEnabled } from "./game-api.js";
import { initPanelFrame, toggle } from "./panel-frame.js";

// Inject the marketplace panel iframe
initPanelFrame();

// Track last user interaction (click + keydown only - lightweight, clearly indicates real activity)
let lastInteractionTime = Date.now();
let lastReportTime = 0;
const INTERACTION_THROTTLE_MS = 30_000; // Report at most every 30 seconds

function updateInteractionTime() {
  lastInteractionTime = Date.now();

  // Leading-edge throttle: send immediately, then ignore for 30 seconds
  // This ensures returning from AFK is reported instantly
  if (Date.now() - lastReportTime >= INTERACTION_THROTTLE_MS) {
    lastReportTime = Date.now();
    bridge.sendToServiceWorker({
      type: "user_interaction",
      payload: { timestamp: lastInteractionTime },
    });
  }
}

// Events only fire when MH tab is in focus (desired behavior)
document.addEventListener("click", updateInteractionTime, { passive: true });
document.addEventListener("keydown", updateInteractionTime, { passive: true });

// Report initial activity immediately
bridge.sendToServiceWorker({
  type: "user_interaction",
  payload: { timestamp: lastInteractionTime },
});

// Listen for game state data posted from the main world
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "mhcm-main-world") return;

  const payload = event.data.payload;

  // XHR log from main-world – forward directly to service worker (not as game_state_update)
  if (payload.type === "xhr_log") {
    const { type: _, ...logData } = payload;
    bridge.sendToServiceWorker({
      type: "xhr_log",
      payload: logData,
    });
    return;
  }

  bridge.sendToServiceWorker({
    type: "game_state_update",
    payload,
  });

  // On first identity detection, set journal entry ID from window object.
  // SB balance is fetched on demand (when placing orders or processing transactions).
  if (payload.type === "identity") {
    setJournalEntryId(payload.lastReadJournalEntryId);
  }
});

// Listen for commands from the service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.source !== "mhcm-service-worker") return false;

  // Click the Camp button to organically refresh game state after transactions
  if (message.type === "refresh_page") {
    const campLink = document.querySelector<HTMLAnchorElement>(
      'a.mousehuntHud-menu-item[data-page="Camp"]'
    );
    if (campLink) {
      campLink.click();
    }
    sendResponse({ ok: true });
    return false;
  }

  // Navigate the game tab to a specific URL (e.g. profile links from panel)
  if (message.type === "navigate_url") {
    window.location.href = message.payload.url;
    sendResponse({ ok: true });
    return false;
  }

  // Toggle panel visibility (toolbar icon click)
  if (message.type === "toggle_panel") {
    toggle();
    sendResponse({ ok: true });
    return false;
  }

  // Server needs active maps – ask main world to re-read window.user
  if (message.type === "request_active_maps") {
    window.postMessage({
      source: "mhcm-content-script",
      type: "request_active_maps",
    }, "*");
    sendResponse({ ok: true });
    return false;
  }

  // XHR logging state from server – update game-api and forward to main-world
  if (message.type === "xhr_logging_state") {
    setXhrLoggingEnabled(message.payload.enabled);
    window.postMessage({
      source: "mhcm-content-script",
      type: "xhr_logging_state",
      payload: { enabled: message.payload.enabled },
    }, "*");
    sendResponse({ ok: true });
    return false;
  }

  bridge.handleServiceWorkerMessage(message, sendResponse);
  // Return true to indicate we'll respond asynchronously
  return true;
});

console.log("[mhcm] content script loaded");
