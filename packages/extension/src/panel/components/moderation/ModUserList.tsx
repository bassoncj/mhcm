import { useState, useEffect } from "preact/hooks";
import type { Suspension } from "@mhcm/shared";
import { modUsers, modSuspensionHistory } from "../../signals/moderation.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { currentUser } from "../../signals/auth.js";
import { PaginationBar } from "../common/PaginationBar.js";
import { IconX } from "../common/Icons.js";

const PAGE_SIZE = 20;

export function ModUserList() {
  const me = currentUser.value;
  const users = modUsers.value;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  // Suspension modal state
  const [modalUserId, setModalUserId] = useState<number | null>(null);
  const [modalReason, setModalReason] = useState("");
  const [modalExpires, setModalExpires] = useState("");

  const filtered = search
    ? users.filter((u) => u.username.toLowerCase().includes(search.toLowerCase()))
    : users;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleDrawer = (userId: number) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);
    wsSend({ type: "mod_get_suspensions", payload: { userId } });
  };

  // Clear suspension history when drawer closes
  useEffect(() => {
    if (expandedUserId === null) {
      modSuspensionHistory.value = null;
    }
  }, [expandedUserId]);

  const handleStatusChange = (userId: number, currentStatus: string, newStatus: string) => {
    if (newStatus === "suspended" && currentStatus === "active") {
      setModalUserId(userId);
      setModalReason("");
      setModalExpires("");
    } else if (newStatus === "active" && currentStatus === "suspended") {
      wsSend({ type: "mod_unsuspend_user", payload: { userId, note: "manual" } });
    }
  };

  const handleSuspendConfirm = () => {
    if (modalUserId === null) return;
    wsSend({
      type: "mod_suspend_user",
      payload: {
        userId: modalUserId,
        reason: modalReason.trim() || undefined,
        expiresAt: modalExpires || undefined,
      },
    });
    setModalUserId(null);
  };

  const handleLift = (userId: number) => {
    wsSend({ type: "mod_unsuspend_user", payload: { userId, note: "manual" } });
    // Refresh suspension history after lifting
    setTimeout(() => wsSend({ type: "mod_get_suspensions", payload: { userId } }), 100);
  };

  const modalUser = modalUserId !== null ? users.find((u) => u.id === modalUserId) : null;
  const historyEntry = modSuspensionHistory.value;

  return (
    <div>
      <div class="search-input-wrap">
        <input
          type="text"
          class="search-input"
          placeholder="Search users..."
          value={search}
          onInput={(e) => { setSearch((e.target as HTMLInputElement).value); setPage(0); }}
        />
        {search && (
          <button type="button" class="search-clear" onClick={() => { setSearch(""); setPage(0); }}>
            <IconX size={14} />
          </button>
        )}
      </div>

      <div class="mod-row-header">
        <span class="mod-row-header-name">User</span>
        <span class="mod-row-header-controls">Status</span>
      </div>
      <div class="item-list">
        {paged.map((user) => (
          <div key={user.id}>
            <div
              class={`item-row${expandedUserId === user.id ? " row-expanded" : ""}`}
              onClick={() => toggleDrawer(user.id)}
            >
              <div class="item-row-info">
                <div class="item-row-name">
                  <span class="map-name">{user.username}</span>
                  <span class="alias-hint">
                    {user.lastConnectedAt
                      ? `Last active: ${formatRelative(user.lastConnectedAt)}`
                      : "Never connected"}
                  </span>
                </div>
              </div>
              <div class="item-tier-controls" onClick={(e) => e.stopPropagation()}>
                {user.role === "user" && user.id !== me?.id ? (
                  <select
                    class="mod-status-select"
                    value={user.status}
                    onChange={(e) => handleStatusChange(user.id, user.status, (e.target as HTMLSelectElement).value)}
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                  </select>
                ) : (
                  <span class={`mod-role-badge role-${user.role}`}>{user.role}</span>
                )}
              </div>
            </div>
            {expandedUserId === user.id && (
              <div class="item-drawer">
                <SuspensionHistory
                  userId={user.id}
                  suspensions={historyEntry?.userId === user.id ? historyEntry.suspensions : null}
                  onLift={() => handleLift(user.id)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />}

      <p class="mouse-count">
        Showing {paged.length} of {filtered.length} users
      </p>

      {filtered.length === 0 && (
        <p class="empty">{search ? "No users match your search." : "No users found."}</p>
      )}

      {/* Suspension modal */}
      {modalUser && (
        <div class="modal-overlay" onClick={() => setModalUserId(null)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">Suspend {modalUser.username}</div>
            <div class="modal-body">
              <label class="mod-modal-label">
                Reason
                <textarea
                  class="mod-modal-textarea"
                  placeholder="Why is this user being suspended?"
                  value={modalReason}
                  onInput={(e) => setModalReason((e.target as HTMLTextAreaElement).value)}
                  rows={3}
                />
              </label>
              <label class="mod-modal-label">
                Expires (empty = indefinite)
                <input
                  type="datetime-local"
                  class="mod-modal-input"
                  value={modalExpires}
                  onInput={(e) => setModalExpires((e.target as HTMLInputElement).value)}
                />
              </label>
            </div>
            <div class="modal-footer">
              <button class="modal-btn cancel" onClick={() => setModalUserId(null)}>
                Cancel
              </button>
              <button class="modal-btn confirm danger" onClick={handleSuspendConfirm}>
                Suspend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SuspensionHistory({
  userId,
  suspensions,
  onLift,
}: {
  userId: number;
  suspensions: Suspension[] | null;
  onLift: () => void;
}) {
  if (suspensions === null) {
    return <p class="loading-small">Loading history...</p>;
  }

  if (suspensions.length === 0) {
    return <p class="suspension-empty">No suspension history</p>;
  }

  return (
    <div class="suspension-history">
      <div class="suspension-history-title">Suspension History</div>
      {suspensions.map((s) => {
        const isActive = !s.liftedAt;
        return (
          <div key={s.id} class={`suspension-entry${isActive ? " active" : ""}`}>
            <div class="suspension-entry-header">
              <span class={`suspension-dot ${isActive ? "dot-active" : "dot-lifted"}`} />
              <span class="suspension-status">{isActive ? "Active" : "Lifted"}</span>
              <span class="suspension-date">{formatDate(s.suspendedAt)}</span>
              {s.reason && <span class="suspension-reason">"{s.reason}"</span>}
            </div>
            <div class="suspension-entry-meta">
              by {s.suspendedByUsername || "System"}
              {s.expiresAt ? ` · Expires ${formatDate(s.expiresAt)}` : " · Indefinite"}
              {s.liftedAt && (
                <>
                  {" · Lifted "}
                  {formatDate(s.liftedAt)}
                  {" by "}
                  {s.liftedByUsername || "System"}
                  {s.liftNote && ` (${s.liftNote})`}
                </>
              )}
            </div>
            {isActive && (
              <button class="btn-small btn-danger suspension-lift-btn" onClick={onLift}>
                Lift
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(isoDate);
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
