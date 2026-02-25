import type { ActiveAlert, AdminAlert, AlertType } from "@mhcm/shared";
import { getDb } from "../connection.js";

export interface AdminAlertRow {
  id: number;
  message: string;
  alert_type: string;
  starts_at: string;
  ends_at: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  /** Joined from users table. */
  username: string;
}

const SELECT_WITH_USER = `
  SELECT a.*, u.username
  FROM admin_alerts a
  JOIN users u ON u.id = a.created_by
`;

function rowToAdminAlert(row: AdminAlertRow): AdminAlert {
  return {
    id: row.id,
    message: row.message,
    alertType: row.alert_type as AlertType,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdBy: row.username,
    createdAt: row.created_at,
  };
}

function rowToActiveAlert(row: AdminAlertRow): ActiveAlert {
  return {
    id: row.id,
    message: row.message,
    alertType: row.alert_type as AlertType,
  };
}

/** Returns the full admin alert with username. */
export function createAlert(
  message: string,
  alertType: AlertType,
  startsAt: string,
  endsAt: string,
  createdBy: number,
): AdminAlert {
  const db = getDb();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO admin_alerts (message, alert_type, starts_at, ends_at, created_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(message, alertType, startsAt, endsAt, createdBy);
  return rowToAdminAlert(
    db.prepare(`${SELECT_WITH_USER} WHERE a.id = ?`).get(lastInsertRowid) as AdminAlertRow,
  );
}

/** Returns the updated alert or undefined if not found. */
export function updateAlert(
  alertId: number,
  message: string,
  alertType: AlertType,
  startsAt: string,
  endsAt: string,
): AdminAlert | undefined {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE admin_alerts
       SET message = ?, alert_type = ?, starts_at = ?, ends_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(message, alertType, startsAt, endsAt, alertId);
  if (result.changes === 0) return undefined;
  return rowToAdminAlert(
    db.prepare(`${SELECT_WITH_USER} WHERE a.id = ?`).get(alertId) as AdminAlertRow,
  );
}

/** CASCADE deletes acknowledgments. */
export function deleteAlert(alertId: number): boolean {
  const result = getDb().prepare("DELETE FROM admin_alerts WHERE id = ?").run(alertId);
  return result.changes > 0;
}

export function listAllAlerts(): AdminAlert[] {
  return (
    getDb()
      .prepare(`${SELECT_WITH_USER} ORDER BY a.starts_at DESC`)
      .all() as AdminAlertRow[]
  ).map(rowToAdminAlert);
}

export function getActiveAlertRows(): AdminAlertRow[] {
  return getDb()
    .prepare(
      `${SELECT_WITH_USER} WHERE datetime('now') BETWEEN datetime(a.starts_at) AND datetime(a.ends_at) ORDER BY a.starts_at ASC`,
    )
    .all() as AdminAlertRow[];
}

/** Used for scheduling on startup. */
export function getUpcomingAlertRows(): AdminAlertRow[] {
  return getDb()
    .prepare(`${SELECT_WITH_USER} WHERE datetime(a.starts_at) > datetime('now') ORDER BY a.starts_at ASC`)
    .all() as AdminAlertRow[];
}

/**
 * Get the first unacknowledged active alert for a user.
 * If isBetaTester is false, excludes beta alerts.
 * Returns the stripped ActiveAlert (no admin metadata) or undefined.
 */
export function getUnacknowledgedAlert(
  userId: number,
  isBetaTester: boolean,
): ActiveAlert | undefined {
  const betaFilter = isBetaTester ? "" : "AND a.alert_type != 'beta'";
  const row = getDb()
    .prepare(
      `SELECT a.id, a.message, a.alert_type
       FROM admin_alerts a
       WHERE datetime('now') BETWEEN datetime(a.starts_at) AND datetime(a.ends_at)
         ${betaFilter}
         AND a.id NOT IN (
           SELECT alert_id FROM user_alert_acknowledgments WHERE user_id = ?
         )
       ORDER BY a.starts_at ASC
       LIMIT 1`,
    )
    .get(userId) as AdminAlertRow | undefined;
  if (!row) return undefined;
  return rowToActiveAlert(row);
}

export function acknowledgeAlert(userId: number, alertId: number): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO user_alert_acknowledgments (user_id, alert_id) VALUES (?, ?)",
    )
    .run(userId, alertId);
}

export function hasAcknowledgedAlert(userId: number, alertId: number): boolean {
  const row = getDb()
    .prepare(
      "SELECT id FROM user_alert_acknowledgments WHERE user_id = ? AND alert_id = ?",
    )
    .get(userId, alertId);
  return row !== undefined;
}
