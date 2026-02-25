import "dotenv/config";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";
import { config, SERVER_VERSION } from "./config.js";
import { initDb, closeDb, getDb } from "./db/connection.js";
import { handleRequest } from "./http/router.js";
import { setupWebSocket } from "./ws/server.js";
import { cleanupStuckTransactions } from "./transactions/slot-orchestrator.js";
import { cleanupStuckSnipingTransactions } from "./transactions/sniping-orchestrator.js";
import { cleanupStuckItemTransactions } from "./transactions/item-orchestrator.js";
import { cleanupStuckMapTransactions } from "./transactions/map-orchestrator.js";
import { loadSettings } from "./settings.js";
import { findAllOpenSnipingOrderTargets } from "./db/queries/sniping-orders.js";
import { trySnipingMatch } from "./orders/sniping-matcher.js";
import { broadcastSnipingOrderBook } from "./orders/sniping-book.js";
import { sweepAllItemMatches } from "./orders/item-matcher.js";
import { sweepAllMapMatches } from "./orders/map-matcher.js";
import { scheduleUpcomingAlerts } from "./ws/handlers/admin-handlers.js";
import { isDraining, startDrain, forceDrain } from "./drain.js";
import { closeMHClient } from "./auth/mh-client.js";

console.log(`[mhcm-server] version ${SERVER_VERSION}`);

await initDb();

loadSettings();

// Schedule future alerts for push-on-activation delivery
scheduleUpcomingAlerts();

if (process.env.RESET) {
  const db = getDb();
  db.exec("DELETE FROM transactions; DELETE FROM orders;");
  console.log("[mhcm-server] reset: cleared all orders and transactions");
}

cleanupStuckTransactions();
cleanupStuckSnipingTransactions();
cleanupStuckItemTransactions();
cleanupStuckMapTransactions();

// Catches orders that were reopened by a previous run's cleanup but never re-matched
const openSnipingTargets = findAllOpenSnipingOrderTargets();
if (openSnipingTargets.length > 0) {
  console.log(`[mhcm-server] startup sweep: checking ${openSnipingTargets.length} sniping target(s) for matches`);
  for (const target of openSnipingTargets) {
    trySnipingMatch(target);
    broadcastSnipingOrderBook(target);
  }
}

sweepAllItemMatches();
sweepAllMapMatches();

// Generate composite thumbnails for groups that are missing them
import { getGroupMemberThumbnails } from "./db/queries/sniping-groups.js";
import { generateGroupThumb, getGroupThumbDataUrl } from "./util/group-thumb.js";

const activeGroups = getDb()
  .prepare("SELECT id FROM sniping_mouse_groups WHERE archived = 0")
  .all() as { id: number }[];
let thumbsQueued = 0;
for (const g of activeGroups) {
  if (!getGroupThumbDataUrl(g.id)) {
    const thumbs = getGroupMemberThumbnails(g.id);
    if (thumbs.length > 0) {
      generateGroupThumb(g.id, thumbs).catch(() => {});
      thumbsQueued++;
    }
  }
}
if (thumbsQueued > 0) {
  console.log(`[mhcm-server] generating ${thumbsQueued} missing group thumbnail(s)`);
}

const useHttps = config.sslKeyPath && config.sslCertPath &&
  existsSync(config.sslKeyPath) && existsSync(config.sslCertPath);

const server = useHttps
  ? createHttpsServer(
      {
        key: readFileSync(config.sslKeyPath!),
        cert: readFileSync(config.sslCertPath!),
      },
      handleRequest
    )
  : createHttpServer(handleRequest);

if (useHttps) {
  console.log("[mhcm-server] SSL enabled - using HTTPS/WSS");
}

setupWebSocket(server);

server.listen(config.port, config.host, () => {
  console.log(`[mhcm-server] listening on ${config.host}:${config.port}`);
});

function doExit(): void {
  server.close(async () => {
    await closeMHClient();
    closeDb();
    console.log("[mhcm-server] stopped");
    process.exit(0);
  });
}

function shutdown(): void {
  if (isDraining()) {
    console.log("\n[mhcm-server] second signal -- force exiting");
    forceDrain(doExit);
    return;
  }
  console.log("\n[mhcm-server] draining before shutdown...");
  startDrain(
    () => {},
    doExit,
  );
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
