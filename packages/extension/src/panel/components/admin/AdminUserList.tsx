import { useState, useEffect, useRef } from "preact/hooks";
import type { UserRole, UserListItem } from "@mhcm/shared";
import { currentUser } from "../../signals/auth.js";
import { IconMoreVertical } from "../common/Icons.js";

interface AdminUserListProps {
  users: UserListItem[];
  showRoleControls?: boolean;
  onSetRole?: (userId: number, role: UserRole) => void;
  onResetMHLink?: (userId: number) => void;
  onRefreshUser?: (userId: number) => void;
}

export function AdminUserList({
  users,
  showRoleControls = false,
  onSetRole,
  onResetMHLink,
  onRefreshUser,
}: AdminUserListProps) {
  const me = currentUser.value;
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (openMenu === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  const handleToggleMenu = (userId: number, e: MouseEvent) => {
    if (openMenu === userId) {
      setOpenMenu(null);
      return;
    }
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    if (onRefreshUser) onRefreshUser(userId);
    setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right });
    setOpenMenu(userId);
  };

  if (users.length === 0) {
    return <p class="empty">No users found.</p>;
  }

  return (
    <table class="mod-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Role</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const isSelf = user.id === me?.id;

          return (
            <tr key={user.id} class={user.status === "suspended" ? "row-suspended" : ""}>
              <td>
                {user.username}
                {isSelf && <span class="badge self">you</span>}
              </td>
              <td>
                {showRoleControls && onSetRole && !isSelf ? (
                  <select
                    value={user.role}
                    onChange={(e) =>
                      onSetRole(user.id, (e.target as HTMLSelectElement).value as UserRole)
                    }
                  >
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                ) : (
                  <span class={`badge role-${user.role}`}>{user.role}</span>
                )}
              </td>
              <td>
                <span class={`badge status-${user.status}`}>{user.status}</span>
              </td>
              <td>
                {!isSelf ? (
                  <div class="user-actions-wrap" ref={openMenu === user.id ? menuRef : undefined}>
                    <button
                      class="user-actions-trigger"
                      onClick={(e) => handleToggleMenu(user.id, e)}
                    >
                      <IconMoreVertical size={14} />
                    </button>
                    {openMenu === user.id && menuPos && (
                      <div
                        class="user-actions-menu"
                        style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
                      >
                        {onResetMHLink && (
                          <button
                            class={`user-actions-item${!user.mhLinked ? " disabled" : ""}`}
                            disabled={!user.mhLinked}
                            onClick={() => { onResetMHLink(user.id); setOpenMenu(null); }}
                          >
                            Reset MH Link
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <span class="text-muted">&mdash;</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
