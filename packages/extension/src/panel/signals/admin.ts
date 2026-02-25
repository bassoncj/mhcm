import { signal } from "@preact/signals";
import type { BetaRequest, RateLimitCategoryConfig, VerificationMethod, UserListItem, AuditEntry, DemoStatus, BetaStatus } from "@mhcm/shared";

/** Admin setting: bypass LM/LL goal count restriction for sell orders (testing only). */
export const allowAnyGoalCount = signal<boolean>(false);

/** Admin setting: XHR diagnostic logging enabled. */
export const xhrLoggingEnabled = signal<boolean>(false);

/** Admin: pending beta access requests. */
export const betaRequests = signal<BetaRequest[]>([]);

/** Admin: reference data sync counts (maps, scrolls, items, mice, ranks, environments). */
export const syncCounts = signal<{ maps: number; scrolls: number; items: number; mice: number; ranks: number; environments: number }>({
  maps: 0, scrolls: 0, items: 0, mice: 0, ranks: 0, environments: 0,
});

/** Admin: tracks which sync operations are currently in-flight (by key, e.g. "items"). */
export const syncingKeys = signal<Set<string>>(new Set());

/** Market enabled config – per-market trading pause. Sent to all users on connect. */
export const marketEnabledConfig = signal<{ slots: boolean; sniping: boolean; items: boolean; maps: boolean }>({
  slots: true, sniping: true, items: true, maps: true,
});

/** Demo data per-market visibility. */
export const demoMarketVisible = signal<{ slots: boolean; sniping: boolean; items: boolean; maps: boolean }>({
  slots: true, sniping: true, items: true, maps: true,
});

/** Rate limit settings (admin-configurable). */
export const rateLimitConfig = signal<Record<string, RateLimitCategoryConfig>>({});

/** Admin rank override for testing (null = use real rank). */
export const adminRankOverride = signal<number | null>(null);

/** Admin setting: risk check timeout in seconds. */
export const riskCheckTimeoutSeconds = signal<number>(90);

/** Admin setting: corkboard verification method. */
export const verificationMethod = signal<VerificationMethod>("service_account");

/** Admin: onboarding step enabled/disabled configs. */
export const onboardingStepConfigs = signal<Record<string, boolean>>({});

/** Admin: onboarding completion stats. */
export const onboardingStats = signal<{
  totalUsers: number;
  completedUsers: number;
  perStep: Array<{ stepId: string; version: number; completedCount: number }>;
} | null>(null);

/** Admin: server drain progress (graceful shutdown). */
export const drainProgress = signal<{
  draining: boolean;
  remaining: number;
  elapsed: number;
} | null>(null);

/** Admin: user list from admin_users_list / admin_user. */
export const adminUsers = signal<UserListItem[]>([]);

/** Admin: audit log entries (accumulated from admin_audit_log responses). */
export const adminAuditLog = signal<{ entries: AuditEntry[]; limit: number; offset: number } | null>(null);

/** Admin: demo data status from admin_demo_status. */
export const adminDemoStatus = signal<DemoStatus | null>(null);

/** Admin: beta configuration and tester list from admin_beta_status. */
export const adminBetaStatus = signal<BetaStatus | null>(null);
