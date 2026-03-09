import { useState, useEffect } from "preact/hooks";
import type { UserRole, MarketType } from "@mhcm/shared";
import { AdminUserList } from "./AdminUserList.js";
import { AuditLog } from "./AuditLog.js";
import { showDisabledMaps } from "../../signals/slots.js";
import { allowAnyGoalCount, xhrLoggingEnabled, syncCounts, syncingKeys, marketEnabledConfig, betaRequests, rateLimitConfig, adminRankOverride, riskCheckTimeoutSeconds, verificationMethod, drainProgress, adminUsers, adminDemoStatus, adminBetaStatus } from "../../signals/admin.js";
import { modRanks } from "../../signals/moderation.js";
import type { RateLimitCategoryConfig } from "@mhcm/shared";
import { marketBetaConfig } from "../../signals/beta.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import {
  IconX,
  IconRefreshCw,
  IconSearch,
  IconUsers,
  IconListOrdered,
  IconMap,
  IconTag,
  IconDiamond,
  IconCrosshair,
  IconShield,
  IconPuzzle,
  IconClock,
  IconHome,
  IconPower,
} from "../common/Icons.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import { AlertsManager } from "./AlertsManager.js";
import { onboardingStepConfigs, onboardingStats } from "../../signals/admin.js";
import { onboardingSteps } from "../../data/onboarding-data.js";

type AdminTab = "settings" | "users" | "beta" | "alerts" | "onboarding" | "system";

const MARKET_LABELS: Record<MarketType, string> = {
  slots: "Slot Marketplace",
  sniping: "Sniping Marketplace",
  items: "Item Marketplace",
  maps: "Map Marketplace",
};

const MARKET_ICONS: Record<MarketType, (props: { size: number }) => any> = {
  slots: IconPuzzle,
  sniping: IconCrosshair,
  items: IconDiamond,
  maps: IconMap,
};

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("settings");
  const [search, setSearch] = useState("");
  const [newTesterId, setNewTesterId] = useState("");
  const [newTesterUsername, setNewTesterUsername] = useState("");
  const [showForceRestartModal, setShowForceRestartModal] = useState(false);

  const demo = adminDemoStatus.value;
  const beta = adminBetaStatus.value;
  const users = adminUsers.value;

  useEffect(() => {
    wsSend({ type: "admin_get_users" });
    wsSend({ type: "admin_get_demo_status" });
    wsSend({ type: "admin_get_beta_status" });
    wsSend({ type: "admin_get_settings" });
    if (modRanks.value.length === 0) {
      wsSend({ type: "mod_get_ranks" });
    }
  }, []);

  // Re-fetch testers list when beta requests change (approve adds to allowed_testers)
  useEffect(() => {
    if (activeTab === "beta") {
      wsSend({ type: "admin_get_beta_status" });
    }
  }, [betaRequests.value]);

  const handleSetRole = (userId: number, role: UserRole) => {
    wsSend({ type: "admin_set_user_role", payload: { userId, role } });
  };

  const handleResetMHLink = (userId: number) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    if (!confirm(`Reset MH account link for ${user.username}? They will need to re-verify.`)) return;
    wsSend({ type: "admin_reset_mh_link", payload: { targetUserId: userId } });
  };

  const handleRefreshUser = (userId: number) => {
    wsSend({ type: "admin_get_user", payload: { userId } });
  };

  const filteredUsers = search
    ? users.filter((u) =>
        u.username.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const counts = syncCounts.value;

  return (
    <div class="admin-dashboard">
      <div class="admin-tabs">
        <button
          class={`admin-tab ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </button>
        <button
          class={`admin-tab ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          class={`admin-tab ${activeTab === "beta" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("beta");
            wsSend({ type: "admin_get_beta_requests" });
          }}
        >
          Beta
        </button>
        <button
          class={`admin-tab ${activeTab === "alerts" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("alerts");
            wsSend({ type: "admin_get_alerts" });
          }}
        >
          Alerts
        </button>
        <button
          class={`admin-tab ${activeTab === "onboarding" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("onboarding");
            wsSend({ type: "admin_get_onboarding_stats" });
          }}
        >
          Onboarding
        </button>
        <button
          class={`admin-tab ${activeTab === "system" ? "active" : ""}`}
          onClick={() => setActiveTab("system")}
        >
          System
        </button>
      </div>

      <div class={`admin-tab-content${activeTab === "system" ? " system-active" : ""}`}>
        {activeTab === "settings" && (
          <>
            <section class="admin-section">
              <h3>General</h3>
              <div class="admin-toggle-row">
                <span class="admin-toggle-label">
                  <IconSearch size={14} /> Show disabled maps in search
                </span>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={showDisabledMaps.value}
                    onChange={(e) => {
                      showDisabledMaps.value = (e.target as HTMLInputElement).checked;
                    }}
                  />
                  <span class="toggle-slider" />
                </label>
              </div>
              <div class="admin-toggle-row">
                <span class="admin-toggle-label">
                  <IconUsers size={14} /> Allow any goal count (bypass LM/LL)
                </span>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={allowAnyGoalCount.value}
                    onChange={(e) => {
                      const value = (e.target as HTMLInputElement).checked;
                      wsSend({ type: "admin_set_allow_any_goal_count", payload: { value } });
                    }}
                  />
                  <span class="toggle-slider" />
                </label>
              </div>
              <div class="admin-toggle-row">
                <span class="admin-toggle-label">
                  <IconListOrdered size={14} /> XHR diagnostic logging
                </span>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={xhrLoggingEnabled.value}
                    onChange={(e) => {
                      const value = (e.target as HTMLInputElement).checked;
                      wsSend({ type: "admin_set_xhr_logging", payload: { enabled: value } });
                    }}
                  />
                  <span class="toggle-slider" />
                </label>
              </div>
              <div class="admin-toggle-row">
                <span class="admin-toggle-label">
                  <IconShield size={14} /> Assume rank (testing)
                </span>
                <select
                  class="rank-override-select"
                  value={adminRankOverride.value ?? ""}
                  onChange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    const rankId = val ? parseInt(val, 10) : null;
                    wsSend({ type: "admin_set_rank_override", payload: { rankId } });
                  }}
                >
                  <option value="">None (real rank)</option>
                  {modRanks.value.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div class="admin-toggle-row">
                <span class="admin-toggle-label">
                  <IconClock size={14} /> Risk check timeout (seconds)
                </span>
                <input
                  type="number"
                  class="rl-input"
                  value={riskCheckTimeoutSeconds.value}
                  min={10}
                  max={300}
                  onInput={(e) => {
                    const val = parseInt((e.target as HTMLInputElement).value, 10);
                    if (!isNaN(val) && val >= 10 && val <= 300) {
                      riskCheckTimeoutSeconds.value = val;
                      wsSend({ type: "admin_set_risk_check_timeout", payload: { seconds: val } });
                    }
                  }}
                />
              </div>
              <div class="admin-toggle-row">
                <span class="admin-toggle-label">
                  <IconShield size={14} /> Verification method
                </span>
                <select
                  class="admin-select"
                  value={verificationMethod.value}
                  onChange={(e) => {
                    const val = (e.target as HTMLSelectElement).value as "service_account" | "proxy_user";
                    verificationMethod.value = val;
                    wsSend({ type: "admin_set_verification_method", payload: { method: val } });
                  }}
                >
                  <option value="service_account">Service Account</option>
                  <option value="proxy_user">Proxy User</option>
                </select>
              </div>
            </section>

            <section class="admin-section">
              <h3>Market Trading</h3>
              {(["slots", "maps", "sniping", "items"] as const).map((market) => {
                const Icon = MARKET_ICONS[market];
                return (
                  <div class="admin-toggle-row" key={market}>
                    <span class="admin-toggle-label">
                      <Icon size={14} /> {MARKET_LABELS[market]}
                    </span>
                    <label class="toggle-switch">
                      <input
                        type="checkbox"
                        checked={marketEnabledConfig.value[market]}
                        onChange={(e) => {
                          wsSend({
                            type: "admin_set_market_enabled",
                            payload: { market, enabled: (e.target as HTMLInputElement).checked },
                          });
                        }}
                      />
                      <span class="toggle-slider" />
                    </label>
                  </div>
                );
              })}
            </section>

            <section class="admin-section">
              <h3>Data Sync</h3>
              <SyncRow icon={<IconMap size={14} />} label="Map Types" count={counts.maps} syncKey="maps" onSync={() => wsSend({ type: "admin_sync_maps" })} />
              <SyncRow icon={<IconTag size={14} />} label="Scrolls" count={counts.scrolls} syncKey="scrolls" onSync={() => wsSend({ type: "admin_sync_scrolls" })} />
              <SyncRow icon={<IconDiamond size={14} />} label="Items" count={counts.items} syncKey="items" onSync={() => wsSend({ type: "admin_sync_items" })} />
              <SyncRow icon={<IconCrosshair size={14} />} label="Mice" count={counts.mice} syncKey="mice" onSync={() => wsSend({ type: "admin_sync_mice" })} />
              <SyncRow icon={<IconShield size={14} />} label="Ranks" count={counts.ranks} syncKey="ranks" onSync={() => wsSend({ type: "admin_sync_ranks" })} />
              <SyncRow icon={<IconHome size={14} />} label="Environments" count={counts.environments} syncKey="environments" onSync={() => wsSend({ type: "admin_sync_environments" })} />
            </section>

          </>
        )}

        {activeTab === "users" && (
          <section class="admin-section">
            <div class="search-input-wrap">
              <input
                type="text"
                class="search-input"
                placeholder="Search users..."
                value={search}
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              />
              {search && (
                <button type="button" class="search-clear" onClick={() => setSearch("")}>
                  <IconX size={14} />
                </button>
              )}
            </div>
            <AdminUserList
              users={filteredUsers}
              showRoleControls
              onSetRole={handleSetRole}
              onResetMHLink={handleResetMHLink}
              onRefreshUser={handleRefreshUser}
            />
          </section>
        )}

        {activeTab === "beta" && (
          <>
            <section class="admin-section">
              <h3>Market Beta</h3>
              <p class="admin-hint">Markets in beta are only accessible to approved testers.</p>
              {(["slots", "sniping", "items", "maps"] as const).map((market) => (
                <div class="admin-toggle-row" key={market}>
                  <span>{MARKET_LABELS[market]}</span>
                  <label class="toggle-switch">
                    <input
                      type="checkbox"
                      checked={marketBetaConfig.value[market]}
                      onChange={(e) => {
                        wsSend({
                          type: "admin_set_market_beta",
                          payload: { market, beta: (e.target as HTMLInputElement).checked },
                        });
                      }}
                    />
                    <span class="toggle-slider" />
                  </label>
                </div>
              ))}
            </section>

            {betaRequests.value.length > 0 && (
              <section class="admin-section">
                <h3>Beta Requests ({betaRequests.value.length})</h3>
                {betaRequests.value.map((req) => (
                  <div class="beta-request-row" key={req.id}>
                    <span>{req.username}</span>
                    {req.discordUsername && <span class="text-muted">{req.discordUsername}</span>}
                    <div class="beta-request-actions">
                      <button
                        class="btn-small btn-success"
                        onClick={() => wsSend({ type: "admin_approve_beta_request", payload: { requestId: req.id } })}
                      >
                        Approve
                      </button>
                      <button
                        class="btn-small btn-danger-outline"
                        onClick={() => wsSend({ type: "admin_deny_beta_request", payload: { requestId: req.id } })}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section class="admin-section">
              <h3>Closed Beta (Account Creation)</h3>
            {beta ? (
              <>
                <div class="beta-status">
                  <span class={`badge ${beta.enabled ? "status-suspended" : "status-active"}`}>
                    {beta.enabled ? "ENABLED" : "DISABLED"}
                  </span>
                  <span class="beta-info">
                    {beta.enabled
                      ? "Only allowed testers can create new accounts"
                      : "Anyone can create new accounts"}
                  </span>
                </div>
                <div class="beta-actions">
                  <button
                    class={`btn-small ${beta.enabled ? "btn-success" : "btn-danger"}`}
                    onClick={() => wsSend({ type: "admin_toggle_beta" })}
                  >
                    {beta.enabled ? "Disable Closed Beta" : "Enable Closed Beta"}
                  </button>
                </div>
                <div class="beta-testers">
                  <h4>Allowed Testers ({beta.testers.length})</h4>
                  <div class="beta-add-form">
                    <input
                      type="text"
                      class="beta-input"
                      placeholder="Discord ID"
                      value={newTesterId}
                      onInput={(e) => setNewTesterId((e.target as HTMLInputElement).value)}
                    />
                    <input
                      type="text"
                      class="beta-input"
                      placeholder="Username (optional)"
                      value={newTesterUsername}
                      onInput={(e) => setNewTesterUsername((e.target as HTMLInputElement).value)}
                    />
                    <button
                      class="btn-small btn-success"
                      disabled={!newTesterId.trim()}
                      onClick={() => {
                        const discordId = newTesterId.trim();
                        if (!discordId) return;
                        wsSend({ type: "admin_add_beta_tester", payload: { discordId, discordUsername: newTesterUsername.trim() || undefined } });
                        setNewTesterId("");
                        setNewTesterUsername("");
                      }}
                    >
                      Add
                    </button>
                  </div>
                  {beta.testers.length === 0 ? (
                    <p class="empty">No testers added yet.</p>
                  ) : (
                    <div class="beta-tester-list">
                      {beta.testers.map((tester) => (
                        <div key={tester.discordId} class="beta-tester-row">
                          <span class="tester-id">{tester.discordId}</span>
                          {tester.discordUsername && (
                            <span class="tester-username">{tester.discordUsername}</span>
                          )}
                          <button
                            class="btn-small btn-danger"
                            onClick={() => wsSend({ type: "admin_remove_beta_tester", payload: { discordId: tester.discordId } })}
                          >
                            <IconX size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p class="loading">Loading...</p>
            )}
            </section>
          </>
        )}

        {activeTab === "alerts" && (
          <section class="admin-section">
            <AlertsManager />
          </section>
        )}

        {activeTab === "onboarding" && (
          <OnboardingTab />
        )}

        {activeTab === "system" && (
          <div class="system-tab-layout">
            <RateLimitsSection />
            <section class="admin-section">
              <h3>Demo Data</h3>
              {demo ? (
                <>
                  <div class="admin-toggle-row">
                    <span class="admin-toggle-label">Demo Data</span>
                    <label class="toggle-switch">
                      <input
                        type="checkbox"
                        checked={demo.enabled}
                        disabled={demo.users === 0}
                        onChange={() => wsSend({ type: "admin_toggle_demo" })}
                      />
                      <span class="toggle-slider" />
                    </label>
                  </div>
                  {demo.users > 0 && (
                    <div class="demo-markets">
                      <p class="admin-hint">{demo.users} demo users</p>
                      {(["slots", "items", "maps", "sniping"] as const).map((market) => {
                        const Icon = MARKET_ICONS[market];
                        const data = demo[market];
                        const visible = demo.markets[market] ?? true;
                        return (
                          <div class="demo-market-row" key={market}>
                            <span class="demo-market-label">
                              <Icon size={12} /> {MARKET_LABELS[market]}
                              <span class="demo-market-counts">{data.orders} orders, {data.transactions} txns</span>
                            </span>
                            <label class="toggle-switch">
                              <input
                                type="checkbox"
                                checked={demo.enabled && visible}
                                disabled={!demo.enabled}
                                onChange={(e) => wsSend({ type: "admin_set_demo_market_visible", payload: { market, visible: (e.target as HTMLInputElement).checked } })}
                              />
                              <span class="toggle-slider" />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div class="demo-actions">
                    <button
                      class="btn-small btn-accent"
                      onClick={() => wsSend({ type: "admin_seed_demo" })}
                    >
                      <IconRefreshCw size={12} /> Reseed
                    </button>
                    <button
                      class="btn-small btn-danger-outline"
                      disabled={demo.users === 0}
                      onClick={() => { if (confirm("Purge all demo data? This cannot be undone.")) wsSend({ type: "admin_purge_demo" }); }}
                    >
                      <IconX size={12} /> Purge
                    </button>
                  </div>
                </>
              ) : (
                <p class="loading">Loading...</p>
              )}
            </section>
            <section class="admin-section audit-section">
              <h3>Audit Log</h3>
              <AuditLog />
            </section>
            <section class="admin-section">
              <h3>System Controls</h3>
              {drainProgress.value?.draining ? (
                <div class="drain-progress">
                  <div class="drain-status">
                    Draining... {drainProgress.value.remaining} transaction{drainProgress.value.remaining !== 1 ? "s" : ""} remaining ({drainProgress.value.elapsed}s)
                  </div>
                  <div class="drain-bar-track">
                    <div
                      class="drain-bar-fill"
                      style={{
                        width: drainProgress.value.remaining === 0 ? "100%" : undefined,
                        animation: "drain-pulse 1.5s ease-in-out infinite",
                      }}
                    />
                  </div>
                  <div class="drain-actions">
                    <button
                      class="btn-secondary"
                      onClick={() => wsSend({ type: "admin_cancel_restart" })}
                    >
                      Cancel
                    </button>
                    <button
                      class="btn-danger-outline"
                      onClick={() => setShowForceRestartModal(true)}
                    >
                      <IconPower size={12} /> Force Restart
                    </button>
                  </div>
                </div>
              ) : (
                <div class="drain-actions">
                  <button
                    class="btn-warning-outline"
                    style="flex: 1"
                    onClick={() => wsSend({ type: "admin_graceful_restart" })}
                  >
                    <IconPower size={12} /> Graceful Restart
                  </button>
                  <button
                    class="btn-danger-outline"
                    style="flex: 1"
                    onClick={() => setShowForceRestartModal(true)}
                  >
                    <IconPower size={12} /> Force Restart
                  </button>
                </div>
              )}
              {showForceRestartModal && (
                <ConfirmModal
                  title="Force Restart"
                  confirmLabel="Force Restart"
                  confirmClass="danger"
                  onConfirm={() => {
                    wsSend({ type: "admin_force_restart" });
                    setShowForceRestartModal(false);
                  }}
                  onCancel={() => setShowForceRestartModal(false)}
                >
                  <p>Force restart the server?{drainProgress.value?.draining
                    ? ` ${drainProgress.value.remaining} transaction(s) will be interrupted.`
                    : " All connected users will be briefly disconnected."}</p>
                </ConfirmModal>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SyncRow({ icon, label, count, syncKey, onSync }: { icon: any; label: string; count: number; syncKey: string; onSync: () => void }) {
  const syncing = syncingKeys.value.has(syncKey);
  const handleClick = () => {
    if (syncing) return;
    const next = new Set(syncingKeys.value);
    next.add(syncKey);
    syncingKeys.value = next;
    onSync();
  };
  return (
    <div class="sync-row">
      <div class="sync-row-left">
        {icon}
        <span>{label}</span>
        <span class="sync-count">{count.toLocaleString()}</span>
      </div>
      <button class="btn-small" onClick={handleClick} disabled={syncing}>
        {syncing ? <IconRefreshCw size={12} class="spin" /> : "Sync"}
      </button>
    </div>
  );
}

const RL_ROWS: Array<{
  key: string;
  label: string;
  group: "ws" | "http";
  unit: string;
}> = [
  { key: "wsGeneral", label: "General", group: "ws", unit: "/sec" },
  { key: "wsMutation", label: "Mutation", group: "ws", unit: "/sec" },
  { key: "wsMatcher", label: "Matcher", group: "ws", unit: "/sec" },
  { key: "httpAuth", label: "Auth (per IP)", group: "http", unit: "/min" },
  { key: "httpApi", label: "API (per user)", group: "http", unit: "/sec" },
];

let rlTimeout: ReturnType<typeof setTimeout> | null = null;
let rlPending: Record<string, RateLimitCategoryConfig> = {};

function sendRateLimitUpdate(key: string, cfg: RateLimitCategoryConfig) {
  rlPending[key] = cfg;
  if (rlTimeout) clearTimeout(rlTimeout);
  rlTimeout = setTimeout(() => {
    wsSend({ type: "admin_set_rate_limits", payload: { rateLimits: rlPending } });
    rlPending = {};
    rlTimeout = null;
  }, 500);
}

function RateLimitGrid({ rows, rl, onChange }: {
  rows: typeof RL_ROWS;
  rl: Record<string, { burst: number; rate: number }>;
  onChange: (key: string, field: "burst" | "rate", raw: string) => void;
}) {
  // Flat array of keyed elements – avoids Preact Fragment-in-grid rendering bugs
  const cells = [
    <span key="h0" class="rl-header" />,
    <span key="h1" class="rl-header">Burst</span>,
    <span key="h2" class="rl-header">Rate</span>,
    <span key="h3" class="rl-header" />,
  ];
  for (const row of rows) {
    const cfg = rl[row.key] || { burst: 0, rate: 0 };
    cells.push(
      <span key={`${row.key}-l`} class="rl-label">{row.label}</span>,
      <input
        key={`${row.key}-b`}
        type="number"
        class="rl-input"
        value={cfg.burst}
        min={1}
        onInput={(e) => onChange(row.key, "burst", (e.target as HTMLInputElement).value)}
      />,
      <input
        key={`${row.key}-r`}
        type="number"
        class="rl-input"
        value={cfg.rate}
        min={1}
        onInput={(e) => onChange(row.key, "rate", (e.target as HTMLInputElement).value)}
      />,
      <span key={`${row.key}-u`} class="rl-unit">{row.unit}</span>,
    );
  }
  return <div class="rl-grid">{cells}</div>;
}

function RateLimitsSection() {
  const rl = rateLimitConfig.value;
  const hasData = Object.keys(rl).length > 0;

  if (!hasData) return null;

  const wsRows = RL_ROWS.filter((r) => r.group === "ws");
  const httpRows = RL_ROWS.filter((r) => r.group === "http");

  const handleChange = (key: string, field: "burst" | "rate", raw: string) => {
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 1) return;
    const current = rl[key] || { burst: 10, rate: 10 };
    const updated = { ...current, [field]: num };
    // Update local signal immediately for responsive UI
    rateLimitConfig.value = { ...rl, [key]: updated };
    sendRateLimitUpdate(key, updated);
  };

  return (
    <section class="admin-section">
      <h3>Rate Limits</h3>

      <h4 class="rl-group-label">WebSocket (per user)</h4>
      <RateLimitGrid rows={wsRows} rl={rl} onChange={handleChange} />

      <h4 class="rl-group-label">HTTP</h4>
      <RateLimitGrid rows={httpRows} rl={rl} onChange={handleChange} />

      <p class="admin-hint">
        Burst = max tokens. Rate = tokens per 10 seconds. Changes apply immediately.
      </p>
    </section>
  );
}

function OnboardingTab() {
  const configs = onboardingStepConfigs.value;
  const stats = onboardingStats.value;

  return (
    <>
      <section class="admin-section">
        <h3>Intro Steps</h3>
        <div class="onboarding-admin-list">
          <div class="onboarding-admin-header">
            <span>Step</span>
            <span>Version</span>
            <span>Enabled</span>
          </div>
          {onboardingSteps.map((step) => (
            <div class="onboarding-admin-row" key={step.id}>
              <span class="onboarding-admin-name">{step.title}</span>
              <span class="onboarding-admin-version">v{step.version}</span>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  checked={configs[step.id] !== false}
                  onChange={(e) => {
                    wsSend({
                      type: "admin_set_onboarding_step_enabled",
                      payload: { stepId: step.id, enabled: (e.target as HTMLInputElement).checked },
                    });
                  }}
                />
                <span class="toggle-slider" />
              </label>
            </div>
          ))}
        </div>
      </section>

      {stats && (
        <section class="admin-section">
          <h3>Completion Stats</h3>
          <div class="onboarding-stats-summary">
            <span>Total users: {stats.totalUsers}</span>
            <span>
              All steps complete: {stats.completedUsers}
              {stats.totalUsers > 0 && ` (${Math.round(100 * stats.completedUsers / stats.totalUsers)}%)`}
            </span>
            <span>
              Incomplete: {stats.totalUsers - stats.completedUsers}
              {stats.totalUsers > 0 && ` (${Math.round(100 * (stats.totalUsers - stats.completedUsers) / stats.totalUsers)}%)`}
            </span>
          </div>
        </section>
      )}
    </>
  );
}
