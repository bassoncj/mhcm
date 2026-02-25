import type { WebSocket } from "ws";
import type { MHMapClass, ServerMessage, SnipingTarget } from "@mhcm/shared";
import type { JWTPayload } from "../auth/sessions.js";
import { initWsLimiter, removeWsLimiter } from "../util/rate-limit.js";

interface Connection {
  ws: WebSocket;
  user: JWTPayload;
  /** Map type IDs the user is subscribed to for order book updates. */
  subscriptions: Set<number>;
  /** Sniping target keys the user is subscribed to for order book updates ("m:123" / "g:456"). */
  snipingSubscriptions: Set<string>;
  /** Item type IDs the user is subscribed to for item order book updates. */
  itemSubscriptions: Set<number>;
  /** Map marketplace subscription keys (compound: "mapTypeId:mode"). */
  mapMarketSubscriptions: Set<string>;
}

const connections = new Map<number, Connection>();

/**
 * Buyers in active map transactions (can't accept new invites).
 * Set by map orchestrator on transaction start; cleared on
 * transaction completion/failure or user disconnect.
 */
const busyBuyers = new Set<number>();

/**
 * Users currently AFK (no interaction with MH tab for 60 minutes).
 * Set when extension reports user_afk; cleared when they report user_active
 * or disconnect (they'll re-report status when they reconnect).
 */
const afkUsers = new Set<number>();

export function addConnection(
  userId: number,
  ws: WebSocket,
  user: JWTPayload
): void {
  const existing = connections.get(userId);
  if (existing) {
    existing.ws.close(1000, "Replaced by new connection");
  }

  connections.set(userId, { ws, user, subscriptions: new Set(), snipingSubscriptions: new Set(), itemSubscriptions: new Set(), mapMarketSubscriptions: new Set() });
  mapsUnreported.add(userId);
  initWsLimiter(userId);
  console.log(
    `[ws] user ${userId} connected (total: ${connections.size})`
  );
}

export function removeConnection(userId: number): void {
  connections.delete(userId);
  busyBuyers.delete(userId);
  afkUsers.delete(userId);
  invalidSettingsUsers.delete(userId);
  pendingRtConfirmations.delete(userId);
  unfinishedOnboarding.delete(userId);
  userActiveMaps.delete(userId);
  mapsUnreported.delete(userId);
  removeWsLimiter(userId);
  console.log(
    `[ws] user ${userId} disconnected (total: ${connections.size})`
  );
}

export function getConnection(
  userId: number
): Connection | undefined {
  return connections.get(userId);
}

export function isUserOnline(userId: number): boolean {
  const conn = connections.get(userId);
  return conn?.ws.readyState === 1; // WebSocket.OPEN
}

export function sendToUser(
  userId: number,
  message: ServerMessage
): boolean {
  const conn = connections.get(userId);
  if (!conn || conn.ws.readyState !== 1) return false;

  conn.ws.send(JSON.stringify(message));
  return true;
}

export function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message);
  for (const conn of connections.values()) {
    if (conn.ws.readyState === 1) {
      conn.ws.send(data);
    }
  }
}

export function broadcastToAdmins(message: ServerMessage): void {
  const data = JSON.stringify(message);
  for (const conn of connections.values()) {
    if (conn.ws.readyState === 1 && conn.user.role === "admin") {
      conn.ws.send(data);
    }
  }
}

/** Broadcast a per-user message (payload varies by user role/state). */
export function broadcastPerUser(
  getPayload: (user: JWTPayload) => ServerMessage
): void {
  for (const conn of connections.values()) {
    if (conn.ws.readyState === 1) {
      conn.ws.send(JSON.stringify(getPayload(conn.user)));
    }
  }
}

export function broadcastToSubscribers(
  mapTypeId: number,
  message: ServerMessage
): void {
  const data = JSON.stringify(message);
  for (const conn of connections.values()) {
    if (conn.ws.readyState === 1 && conn.subscriptions.has(mapTypeId)) {
      conn.ws.send(data);
    }
  }
}

export function addSubscription(
  userId: number,
  mapTypeId: number
): void {
  const conn = connections.get(userId);
  if (conn) conn.subscriptions.add(mapTypeId);
}

export function removeSubscription(
  userId: number,
  mapTypeId: number
): void {
  const conn = connections.get(userId);
  if (conn) conn.subscriptions.delete(mapTypeId);
}

export function getConnectionCount(): number {
  return connections.size;
}

export function getAllSubscriptions(): Map<number, Set<number>> {
  const result = new Map<number, Set<number>>();
  for (const [userId, conn] of connections) {
    if (conn.ws.readyState !== 1) continue;
    for (const mapTypeId of conn.subscriptions) {
      let set = result.get(mapTypeId);
      if (!set) {
        set = new Set();
        result.set(mapTypeId, set);
      }
      set.add(userId);
    }
  }
  return result;
}

export function getOnlineUserIds(): ReadonlySet<number> {
  const online = new Set<number>();
  for (const [userId, conn] of connections) {
    if (conn.ws.readyState === 1) {
      online.add(userId);
    }
  }
  return online;
}

export function markBuyerBusy(userId: number): void {
  busyBuyers.add(userId);
}

export function markBuyerAvailable(userId: number): void {
  busyBuyers.delete(userId);
}

export function getBusyBuyerIds(): ReadonlySet<number> {
  return busyBuyers;
}

export function markUserAfk(userId: number): void {
  afkUsers.add(userId);
}

export function markUserActive(userId: number): void {
  afkUsers.delete(userId);
}

export function getAfkUserIds(): ReadonlySet<number> {
  return afkUsers;
}

export function isUserAfk(userId: number): boolean {
  return afkUsers.has(userId);
}

/**
 * Users whose MH game settings are invalid (map invites or supply transfers disabled).
 * Set when extension reports invalid settings; cleared when they report valid settings
 * or disconnect (they'll re-report on reconnect).
 */
const invalidSettingsUsers = new Set<number>();

export function markUserSettingsInvalid(userId: number): void {
  invalidSettingsUsers.add(userId);
}

export function markUserSettingsValid(userId: number): void {
  invalidSettingsUsers.delete(userId);
}

export function getInvalidSettingsUserIds(): ReadonlySet<number> {
  return invalidSettingsUsers;
}

export function isUserSettingsInvalid(userId: number): boolean {
  return invalidSettingsUsers.has(userId);
}

/**
 * Users with pending RT manual confirmations (buyer left map before auto RT flow).
 * Blocks all matchers until they confirm they returned tradables manually.
 */
const pendingRtConfirmations = new Set<number>();

export function markPendingRtConfirmation(userId: number): void {
  pendingRtConfirmations.add(userId);
}

export function clearPendingRtConfirmation(userId: number): void {
  pendingRtConfirmations.delete(userId);
}

export function getPendingRtConfirmationUserIds(): ReadonlySet<number> {
  return pendingRtConfirmations;
}

const unfinishedOnboarding = new Set<number>();

export function markUserOnboardingIncomplete(userId: number): void {
  unfinishedOnboarding.add(userId);
}

export function markUserOnboardingComplete(userId: number): void {
  unfinishedOnboarding.delete(userId);
}

export function getUnfinishedOnboardingUserIds(): ReadonlySet<number> {
  return unfinishedOnboarding;
}

export function isUserOnboardingIncomplete(userId: number): boolean {
  return unfinishedOnboarding.has(userId);
}

/** Per-user map of MH map IDs → map class the user is currently on. */
const userActiveMaps = new Map<number, Map<number, MHMapClass>>();

/** Users who haven't sent update_active_maps yet since connecting.
 *  Treated as "potentially on a map" by the matcher to prevent false matches after restart. */
const mapsUnreported = new Set<number>();

export function setUserActiveMaps(
  userId: number,
  maps: Array<{ mapId: number; mapClass: MHMapClass }>
): { removedMapIds: number[]; removedClasses: Set<MHMapClass> } {
  const prev = userActiveMaps.get(userId) ?? new Map<number, MHMapClass>();
  const next = new Map<number, MHMapClass>();
  for (const m of maps) next.set(m.mapId, m.mapClass);
  userActiveMaps.set(userId, next);
  mapsUnreported.delete(userId);

  const removedMapIds: number[] = [];
  for (const id of prev.keys()) {
    if (!next.has(id)) removedMapIds.push(id);
  }

  const prevClasses = new Set(prev.values());
  const nextClasses = new Set(next.values());
  const removedClasses = new Set<MHMapClass>();
  for (const cls of prevClasses) {
    if (!nextClasses.has(cls)) removedClasses.add(cls);
  }

  return { removedMapIds, removedClasses };
}

export function getUserActiveMaps(userId: number): ReadonlySet<number> {
  const maps = userActiveMaps.get(userId);
  return maps ? new Set(maps.keys()) : new Set<number>();
}

export function getUserActiveMapsFull(userId: number): ReadonlyMap<number, MHMapClass> {
  return userActiveMaps.get(userId) ?? new Map<number, MHMapClass>();
}

export function isUserOnMapClass(userId: number, mapClass: MHMapClass): boolean {
  const maps = userActiveMaps.get(userId);
  if (!maps) return false;
  for (const cls of maps.values()) {
    if (cls === mapClass) return true;
  }
  return false;
}

export function isMapsUnreported(userId: number): boolean {
  return mapsUnreported.has(userId);
}

/**
 * Add a single map to a user's active maps (e.g. after transaction completion).
 * Updates state immediately rather than waiting for the extension to report it.
 * setUserActiveMaps() will replace with authoritative state when update_active_maps arrives.
 */
export function addUserActiveMap(userId: number, mhMapId: number, mapClass: MHMapClass): void {
  let maps = userActiveMaps.get(userId);
  if (!maps) {
    maps = new Map<number, MHMapClass>();
    userActiveMaps.set(userId, maps);
  }
  maps.set(mhMapId, mapClass);
}

export function getUsersOnMap(mhMapId: number): number[] {
  const result: number[] = [];
  for (const [userId, maps] of userActiveMaps) {
    if (maps.has(mhMapId)) result.push(userId);
  }
  return result;
}

export function snipingSubKey(target: SnipingTarget): string {
  if (target.mouseGroupId != null) return `g:${target.mouseGroupId}`;
  if (target.itemTypeId != null) return `i:${target.itemTypeId}`;
  if (target.itemGroupId != null) return `ig:${target.itemGroupId}`;
  return `m:${target.mouseTypeId}`;
}

export function addSnipingSubscription(
  userId: number,
  target: SnipingTarget
): void {
  const conn = connections.get(userId);
  if (conn) conn.snipingSubscriptions.add(snipingSubKey(target));
}

export function removeSnipingSubscription(
  userId: number,
  target: SnipingTarget
): void {
  const conn = connections.get(userId);
  if (conn) conn.snipingSubscriptions.delete(snipingSubKey(target));
}

export function broadcastToSnipingSubscribers(
  target: SnipingTarget,
  message: ServerMessage
): void {
  const key = snipingSubKey(target);
  const data = JSON.stringify(message);
  for (const conn of connections.values()) {
    if (conn.ws.readyState === 1 && conn.snipingSubscriptions.has(key)) {
      conn.ws.send(data);
    }
  }
}

export function addItemSubscription(
  userId: number,
  itemTypeId: number
): void {
  const conn = connections.get(userId);
  if (conn) conn.itemSubscriptions.add(itemTypeId);
}

export function removeItemSubscription(
  userId: number,
  itemTypeId: number
): void {
  const conn = connections.get(userId);
  if (conn) conn.itemSubscriptions.delete(itemTypeId);
}

export function broadcastToItemSubscribers(
  itemTypeId: number,
  message: ServerMessage
): void {
  const data = JSON.stringify(message);
  for (const conn of connections.values()) {
    if (conn.ws.readyState === 1 && conn.itemSubscriptions.has(itemTypeId)) {
      conn.ws.send(data);
    }
  }
}

function mapSubKey(mapTypeId: number, mode: "unopened" | "completed"): string {
  return `${mapTypeId}:${mode}`;
}

export function addMapSubscription(
  userId: number,
  mapTypeId: number,
  mode: "unopened" | "completed"
): void {
  const conn = connections.get(userId);
  if (conn) {
    conn.mapMarketSubscriptions.add(mapSubKey(mapTypeId, mode));
  }
}

export function removeMapSubscription(
  userId: number,
  mapTypeId: number,
  mode: "unopened" | "completed"
): void {
  const conn = connections.get(userId);
  if (conn) {
    conn.mapMarketSubscriptions.delete(mapSubKey(mapTypeId, mode));
  }
}

export function broadcastToMapSubscribers(
  mapTypeId: number,
  mode: "unopened" | "completed",
  message: ServerMessage
): void {
  const key = mapSubKey(mapTypeId, mode);
  const data = JSON.stringify(message);
  for (const conn of connections.values()) {
    if (conn.ws.readyState === 1 && conn.mapMarketSubscriptions.has(key)) {
      conn.ws.send(data);
    }
  }
}
