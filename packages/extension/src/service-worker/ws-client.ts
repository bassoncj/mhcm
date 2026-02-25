import {
  WS_PING_INTERVAL_MS,
  WS_PONG_TIMEOUT_MS,
  WS_RECONNECT_INITIAL_MS,
  WS_RECONNECT_MAX_MS,
} from "@mhcm/shared";
import type { ClientMessage, ServerMessage } from "@mhcm/shared";
import { getState, setWsConnected } from "./state.js";
import { DEFAULT_SERVER_URL } from "../shared/constants.js";

export type ServerMessageHandler = (message: ServerMessage) => void;
export type ConnectionChangeHandler = (connected: boolean) => void;

let ws: WebSocket | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let pongTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = WS_RECONNECT_INITIAL_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;
let onMessage: ServerMessageHandler | null = null;
let onConnectionChange: ConnectionChangeHandler | null = null;
let onAuthFailure: ((reason: string) => void) | null = null;

async function getServerUrl(): Promise<string> {
  const data = await chrome.storage.local.get(["mhcm_server_url"]);
  return data.mhcm_server_url || DEFAULT_SERVER_URL;
}

export function setMessageHandler(handler: ServerMessageHandler): void {
  onMessage = handler;
}

export function setConnectionChangeHandler(handler: ConnectionChangeHandler): void {
  onConnectionChange = handler;
}

export function setAuthFailureHandler(handler: (reason: string) => void): void {
  onAuthFailure = handler;
}

export async function connect(): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN) return;

  const serverUrl = await getServerUrl();
  const token = getState().authToken;

  // Append token as query param for WS auth
  const url = token ? `${serverUrl}?token=${encodeURIComponent(token)}` : serverUrl;

  intentionalClose = false;

  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.error("[mhcm-ws] failed to create WebSocket:", err);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log("[mhcm-ws] connected");
    setWsConnected(true);
    reconnectDelay = WS_RECONNECT_INITIAL_MS;
    startPing();

    // Notify after WebSocket is fully open and ready
    // (onopen fires during transition, some browsers may not have readyState=OPEN yet)
    if (ws?.readyState === WebSocket.OPEN) {
      onConnectionChange?.(true);
    }
  };

  ws.onmessage = (event) => {
    try {
      const message: ServerMessage = JSON.parse(event.data);

      if (message.type === "pong") {
        clearPongTimeout();
        return;
      }

      onMessage?.(message);
    } catch (err) {
      console.error("[mhcm-ws] failed to parse message:", err);
    }
  };

  ws.onclose = (event) => {
    console.log("[mhcm-ws] disconnected", event.code, event.reason);
    cleanup();
    setWsConnected(false);
    onConnectionChange?.(false);

    if (event.code === 4001) {
      // Auth rejected – token expired or invalid
      onAuthFailure?.("Session expired. Please log in again.");
      return;
    }

    if (event.code === 4003) {
      // Account suspended
      onAuthFailure?.("Your account has been suspended.");
      return;
    }

    if (!intentionalClose) {
      scheduleReconnect();
    }
  };

  ws.onerror = (err) => {
    console.error("[mhcm-ws] error:", err);
    // onclose will fire after onerror
  };
}

export function disconnect(): void {
  intentionalClose = true;
  cleanup();
  ws?.close();
  ws = null;
  setWsConnected(false);
}

export function send(message: ClientMessage): void {
  if (ws?.readyState !== WebSocket.OPEN) {
    console.warn("[mhcm-ws] cannot send, not connected");
    return;
  }

  ws.send(JSON.stringify(message));
}

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

function startPing(): void {
  stopPing();
  pingInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      send({ type: "ping" });
      pongTimeout = setTimeout(() => {
        console.warn("[mhcm-ws] pong timeout, closing");
        ws?.close();
      }, WS_PONG_TIMEOUT_MS);
    }
  }, WS_PING_INTERVAL_MS);
}

function stopPing(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  clearPongTimeout();
}

function clearPongTimeout(): void {
  if (pongTimeout) {
    clearTimeout(pongTimeout);
    pongTimeout = null;
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;

  console.log(`[mhcm-ws] reconnecting in ${reconnectDelay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);

  reconnectDelay = Math.min(reconnectDelay * 2, WS_RECONNECT_MAX_MS);
}

function cleanup(): void {
  stopPing();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}
