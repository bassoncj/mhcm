import { getDb } from "../connection.js";
import { getEnabledOnboardingSteps } from "../../settings.js";
import { ONBOARDING_STEPS } from "@mhcm/shared";
import type { OnboardingTask } from "@mhcm/shared";

/**
 * Get incomplete onboarding tasks for a user, filtered to enabled steps only.
 * Returns tasks where completed_at IS NULL and step_id is in the enabled set.
 */
export function getIncompleteOnboardingTasks(userId: number): OnboardingTask[] {
  const enabledSteps = getEnabledOnboardingSteps();
  if (enabledSteps.length === 0) return [];

  const placeholders = enabledSteps.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT step_id, version, completed_at
       FROM onboarding_tasks
       WHERE user_id = ? AND completed_at IS NULL
         AND step_id IN (${placeholders})`
    )
    .all(userId, ...enabledSteps) as Array<{
    step_id: string;
    version: number;
    completed_at: string | null;
  }>;

  return rows.map((r) => ({
    stepId: r.step_id,
    version: r.version,
    completedAt: r.completed_at,
  }));
}

/**
 * Get ALL onboarding tasks for a user (complete + incomplete), filtered to enabled steps.
 * Only returns the row matching the CURRENT version per step (from ONBOARDING_STEPS),
 * so old completed rows from previous versions don't confuse the wizard.
 */
export function getAllOnboardingTasks(userId: number): OnboardingTask[] {
  const enabledSteps = getEnabledOnboardingSteps();
  if (enabledSteps.length === 0) return [];

  const placeholders = enabledSteps.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT step_id, version, completed_at
       FROM onboarding_tasks
       WHERE user_id = ? AND step_id IN (${placeholders})`
    )
    .all(userId, ...enabledSteps) as Array<{
    step_id: string;
    version: number;
    completed_at: string | null;
  }>;

  const currentVersions = new Map(
    ONBOARDING_STEPS.map((s) => [s.id, s.version])
  );

  return rows
    .filter((r) => r.version === currentVersions.get(r.step_id))
    .map((r) => ({
      stepId: r.step_id,
      version: r.version,
      completedAt: r.completed_at,
    }));
}

export function isUserOnboardingComplete(userId: number): boolean {
  return getIncompleteOnboardingTasks(userId).length === 0;
}

export function completeOnboardingTask(
  userId: number,
  stepId: string,
  version: number
): void {
  getDb()
    .prepare(
      `UPDATE onboarding_tasks
       SET completed_at = datetime('now')
       WHERE user_id = ? AND step_id = ? AND version = ? AND completed_at IS NULL`
    )
    .run(userId, stepId, version);
}

export function insertOnboardingTasksForUser(
  userId: number,
  steps: Array<{ id: string; version: number }>
): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO onboarding_tasks (user_id, step_id, version)
     VALUES (?, ?, ?)`
  );
  const run = db.transaction(() => {
    for (const step of steps) {
      insert.run(userId, step.id, step.version);
    }
  });
  run();
}

/**
 * Insert onboarding tasks for a new user using current enabled steps.
 * Called from the auth/registration flow.
 */
export function insertOnboardingTasksForNewUser(userId: number): void {
  const enabledSteps = getEnabledOnboardingSteps();
  const steps = ONBOARDING_STEPS
    .filter((s) => enabledSteps.includes(s.id))
    .map((s) => ({ id: s.id, version: s.version }));
  if (steps.length > 0) {
    insertOnboardingTasksForUser(userId, steps);
  }
}

/**
 * Insert a new version's tasks for ALL existing users, and clean up stale
 * incomplete rows from older versions.
 */
export function insertOnboardingTasksForNewVersion(
  stepId: string,
  version: number
): void {
  const db = getDb();
  db.transaction(() => {
    // Delete stale incomplete rows for older versions
    db.prepare(
      `DELETE FROM onboarding_tasks
       WHERE step_id = ? AND version < ? AND completed_at IS NULL`
    ).run(stepId, version);

    // Insert new version tasks for all non-demo users
    db.prepare(
      `INSERT OR IGNORE INTO onboarding_tasks (user_id, step_id, version)
       SELECT id, ?, ? FROM users WHERE is_demo = 0`
    ).run(stepId, version);
  })();
}

export function onboardingVersionExists(
  stepId: string,
  version: number
): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 FROM onboarding_tasks WHERE step_id = ? AND version = ? LIMIT 1`
    )
    .get(stepId, version);
  return row !== undefined;
}

export function getOnboardingCompletionStats(): {
  totalUsers: number;
  completedUsers: number;
  perStep: Array<{ stepId: string; version: number; completedCount: number }>;
} {
  const db = getDb();
  const enabledSteps = getEnabledOnboardingSteps();

  if (enabledSteps.length === 0) {
    return { totalUsers: 0, completedUsers: 0, perStep: [] };
  }

  const placeholders = enabledSteps.map(() => "?").join(",");

  // Total non-demo users who have at least one onboarding task for an enabled step
  const totalUsers = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT ot.user_id) as count
         FROM onboarding_tasks ot
         JOIN users u ON u.id = ot.user_id
         WHERE u.is_demo = 0 AND ot.step_id IN (${placeholders})`
      )
      .get(...enabledSteps) as { count: number }
  ).count;

  // Non-demo users who have at least one incomplete task for enabled steps
  const incompleteCount = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT ot.user_id) as count
         FROM onboarding_tasks ot
         JOIN users u ON u.id = ot.user_id
         WHERE u.is_demo = 0 AND ot.completed_at IS NULL AND ot.step_id IN (${placeholders})`
      )
      .get(...enabledSteps) as { count: number }
  ).count;

  const completedUsers = totalUsers - incompleteCount;

  // Per-step stats: count of non-demo users who completed each step (latest version)
  const perStep = db
    .prepare(
      `SELECT ot.step_id, ot.version, COUNT(*) as completed_count
       FROM onboarding_tasks ot
       JOIN users u ON u.id = ot.user_id
       WHERE u.is_demo = 0 AND ot.completed_at IS NOT NULL AND ot.step_id IN (${placeholders})
       GROUP BY ot.step_id, ot.version
       ORDER BY ot.step_id, ot.version DESC`
    )
    .all(...enabledSteps) as Array<{
    step_id: string;
    version: number;
    completed_count: number;
  }>;

  return {
    totalUsers,
    completedUsers,
    perStep: perStep.map((r) => ({
      stepId: r.step_id,
      version: r.version,
      completedCount: r.completed_count,
    })),
  };
}
