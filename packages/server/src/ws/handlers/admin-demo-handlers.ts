import type { ClientMessage } from "@mhcm/shared";
import type { JWTPayload } from "../../auth/sessions.js";
import { sendToUser, broadcast, broadcastPerUser, getAllSubscriptions } from "../connections.js";
import { isAdmin } from "./handler-utils.js";
import { isDemoEnabled, setDemoEnabled, setDemoMarketVisible, getDemoMarketConfig } from "../../demo/demo-mode.js";
import { seedDemoData, purgeDemoData, getDemoStats } from "../../demo/seed-demo-data.js";
import { invalidateHomeCache } from "../../db/queries/slot-home.js";
import { computeHomeData } from "../../db/queries/slot-home.js";
import { computeItemHomeData, invalidateItemHomeCache } from "../../db/queries/item-home.js";
import { invalidateItemMarketStatsCache } from "../../db/queries/item-transactions.js";
import { invalidateMapHomeCache } from "../../db/queries/map-home.js";
import { invalidateMapMarketStatsCache } from "../../db/queries/map-transactions.js";
import { invalidateSnipingHomeCache, invalidateSnipingItemHomeCache } from "../../db/queries/sniping-home.js";
import { invalidateSnipingStatsCache } from "../../db/queries/sniping-stats.js";
import { invalidateAvgPriceCache, broadcastMapTypes } from "../../maps/catalog.js";
import { broadcastOrderBook } from "../../orders/slot-book.js";
import { broadcastItemOrderBook } from "../../orders/item-book.js";
import { broadcastMapOrderBook } from "../../orders/map-book.js";
import { broadcastSnipingOrderBook } from "../../orders/sniping-book.js";
import { findAllOpenItemOrderTypes } from "../../db/queries/item-orders.js";
import { findAllOpenMapOrderTypes } from "../../db/queries/map-orders.js";
import { findAllOpenSnipingOrderTargets } from "../../db/queries/sniping-orders.js";

function invalidateAndBroadcast(): void {
  invalidateHomeCache();
  invalidateAvgPriceCache();
  invalidateItemHomeCache();
  invalidateItemMarketStatsCache();
  invalidateMapHomeCache();
  invalidateMapMarketStatsCache();
  invalidateSnipingHomeCache();
  invalidateSnipingItemHomeCache();
  invalidateSnipingStatsCache();

  const subs = getAllSubscriptions();
  for (const [mapTypeId] of subs) {
    broadcastOrderBook(mapTypeId);
  }

  for (const itemTypeId of findAllOpenItemOrderTypes()) {
    broadcastItemOrderBook(itemTypeId);
  }

  for (const { map_type_id, mode } of findAllOpenMapOrderTypes()) {
    broadcastMapOrderBook(map_type_id, mode);
  }

  for (const target of findAllOpenSnipingOrderTargets()) {
    broadcastSnipingOrderBook(target);
  }

  broadcastMapTypes();

  const homeData = computeHomeData();
  broadcast({ type: "home_data", payload: homeData });

  broadcastPerUser((user) => ({
    type: "item_home_data" as const,
    payload: computeItemHomeData(user.userId),
  }));
}

export function handleAdminDemoMessage(
  userId: number,
  user: JWTPayload,
  message: ClientMessage,
): boolean {
  switch (message.type) {
    case "admin_get_demo_status": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_get_demo_status" } });
        return true;
      }
      sendToUser(userId, { type: "admin_demo_status", payload: getDemoStats() });
      return true;
    }

    case "admin_toggle_demo": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_toggle_demo" } });
        return true;
      }
      setDemoEnabled(!isDemoEnabled());
      invalidateAndBroadcast();
      sendToUser(userId, { type: "admin_demo_status", payload: getDemoStats() });
      return true;
    }

    case "admin_seed_demo": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_seed_demo" } });
        return true;
      }
      purgeDemoData();
      seedDemoData();
      invalidateAndBroadcast();
      sendToUser(userId, { type: "admin_demo_status", payload: getDemoStats() });
      return true;
    }

    case "admin_purge_demo": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_purge_demo" } });
        return true;
      }
      purgeDemoData();
      setDemoEnabled(false);
      invalidateAndBroadcast();
      sendToUser(userId, { type: "admin_demo_status", payload: getDemoStats() });
      return true;
    }

    case "admin_set_demo_market_visible": {
      if (!isAdmin(user)) {
        sendToUser(userId, { type: "error", payload: { message: "Unauthorized", source: "admin_set_demo_market_visible" } });
        return true;
      }
      const { market: demoMarket, visible } = message.payload;
      setDemoMarketVisible(demoMarket, visible);
      switch (demoMarket) {
        case "slots":
          invalidateHomeCache();
          invalidateAvgPriceCache();
          break;
        case "items":
          invalidateItemHomeCache();
          invalidateItemMarketStatsCache();
          break;
        case "maps":
          invalidateMapHomeCache();
          invalidateMapMarketStatsCache();
          invalidateAvgPriceCache();
          break;
        case "sniping":
          invalidateSnipingHomeCache();
          invalidateSnipingItemHomeCache();
          invalidateSnipingStatsCache();
          break;
      }
      broadcast({ type: "demo_market_config", payload: getDemoMarketConfig() });
      sendToUser(userId, { type: "admin_demo_status", payload: getDemoStats() });
      return true;
    }

    default:
      return false;
  }
}
