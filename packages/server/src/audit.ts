import { appendFile } from "node:fs/promises";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

export type AuditEvent =
  | "user_registered"
  | "user_login"
  | "user_login_failed"
  | "user_role_changed"
  | "user_suspended"
  | "user_unsuspended"
  | "mh_account_linked"
  | "mh_account_verified"
  | "discord_linked"
  | "order_created"
  | "order_cancelled"
  | "order_adjusted"
  | "order_matched"
  | "order_deprioritized"
  | "map_type_enabled"
  | "map_type_disabled"
  | "map_type_alias_updated"
  | "map_type_thumbnail_updated"
  | "map_type_lm_config_updated"
  | "transaction_state_change"
  | "transaction_completed"
  | "transaction_failed"
  | "transaction_pending_payment"
  | "payment_retry"
  | "leave_map_requested"
  | "ws_connected"
  | "ws_disconnected"
  | "user_afk"
  | "user_active"
  | "mouse_tier_set"
  | "mouse_map_tier_set"
  | "mouse_map_tier_deleted"
  | "mouse_alias_added"
  | "mouse_alias_deleted"
  | "mouse_alias_updated"
  | "settings_changed"
  | "closed_beta_toggled"
  | "tester_added"
  | "tester_removed"
  | "notification_prefs_updated"
  | "sniping_order_matched"
  | "sniping_transaction_state_change"
  | "sniping_transaction_completed"
  | "sniping_transaction_failed"
  | "sniping_insufficient_sb"
  | "sniping_grace_expired"
  | "sniping_payment_resumed"
  | "sniping_group_created"
  | "sniping_group_toggled"
  | "sniping_group_archived"
  | "sniping_group_deleted"
  | "item_order_created"
  | "item_order_cancelled"
  | "item_order_adjusted"
  | "item_order_matched"
  | "item_order_deprioritized"
  | "item_transaction_state_change"
  | "item_transaction_completed"
  | "item_transaction_failed"
  | "item_type_toggled"
  | "item_type_alias_set"
  | "item_type_thumbnail_set"
  | "item_types_synced"
  | "map_order_created"
  | "map_order_cancelled"
  | "map_order_adjusted"
  | "map_order_matched"
  | "map_order_deprioritized"
  | "map_transaction_state_change"
  | "map_transaction_completed"
  | "map_transaction_failed"
  | "map_scroll_linked"
  | "map_min_rank_set"
  | "scrolls_synced"
  | "ranks_synced"
  | "server_restart"
  | "server_drain_started"
  | "server_drain_completed"
  | "server_drain_cancelled"
  | "server_drain_forced"
  | "market_beta_toggled"
  | "beta_request_created"
  | "beta_request_approved"
  | "beta_request_denied"
  | "alert_created"
  | "alert_updated"
  | "alert_deleted"
  | "version_alert_toggled"
  | "market_enabled_toggled"
  | "map_types_synced"
  | "mouse_types_synced"
  | "map_class_set"
  | "item_tier_set"
  | "item_map_tier_set"
  | "item_map_tier_deleted"
  | "item_found"
  | "item_group_created"
  | "item_group_toggled"
  | "item_group_archived"
  | "item_group_deleted"
  | "map_type_goal_count_updated"
  | "map_type_market_enabled"
  | "map_type_market_disabled"
  | "environments_synced"
  | "map_supports_rt_set"
  | "rt_manual_confirm"
  | "rt_manual_fallback"
  | "mh_link_reset"
  | "verification_failed";

interface AuditEntry {
  timestamp: string;
  event: AuditEvent;
  userId?: number;
  data?: Record<string, unknown>;
}

let logDir: string | null = null;

function ensureLogDir(): void {
  if (logDir) return;
  logDir = dirname(config.auditLogPath);
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

const auditBuffer: string[] = [];
let flushPending = false;

export function audit(
  event: AuditEvent,
  userId?: number,
  data?: Record<string, unknown>
): void {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...(userId != null && { userId }),
    ...(data && { data }),
  };

  const line = JSON.stringify(entry);

  console.log(`[audit] ${line}`);

  auditBuffer.push(line);
  if (!flushPending) {
    flushPending = true;
    queueMicrotask(flushAuditBuffer);
  }
}

async function flushAuditBuffer(): Promise<void> {
  flushPending = false;
  if (auditBuffer.length === 0) return;

  const lines = auditBuffer.splice(0).join("\n") + "\n";
  try {
    ensureLogDir();
    await appendFile(config.auditLogPath, lines);
  } catch (err) {
    console.error("[audit] failed to write to log file:", err);
  }
}

export function readAuditLog(
  limit: number = 100,
  offset: number = 0
): AuditEntry[] {
  try {
    if (!existsSync(config.auditLogPath)) return [];

    const content = readFileSync(config.auditLogPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    const reversed = lines.reverse();
    const sliced = reversed.slice(offset, offset + limit);

    return sliced.map((line) => {
      try {
        return JSON.parse(line) as AuditEntry;
      } catch {
        return { timestamp: "", event: "user_login" as AuditEvent, data: { raw: line } };
      }
    });
  } catch (err) {
    console.error("[audit] failed to read log file:", err);
    return [];
  }
}
