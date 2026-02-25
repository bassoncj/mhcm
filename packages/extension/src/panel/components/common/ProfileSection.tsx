import { currentUser, mhAccount, authToken } from "../../signals/auth.js";
import { wsConnected } from "../../signals/connection.js";
import { playerIdentity, playerTitleName } from "../../signals/game-state.js";
import { themeMode, toggleTheme } from "../../signals/theme.js";
import { logout, getApiBaseUrl } from "../../hooks/useAuth.js";
import { IconSun, IconMoon, IconLogOut } from "./Icons.js";

export function ProfileSection() {
  const user = currentUser.value;
  const mh = mhAccount.value;
  const connected = wsConnected.value;
  const identity = playerIdentity.value;
  const theme = themeMode.value;

  if (!user) return null;

  return (
    <div class="profile-section">
      <div class="card">
        <div class="profile-header">
          <span class="profile-name">{user.username}</span>
          {user.role !== "user" && (
            <span class={`badge role-${user.role}`}>{user.role}</span>
          )}
        </div>
      </div>

      <div class="card">
        <div class="profile-label">MouseHunt Account</div>
        {mh?.verified ? (
          <div>
            <span class="success">Verified</span>
            {identity && (
              <span class="profile-detail"> &middot; Player ID: {identity.userId}</span>
            )}
            {playerTitleName.value && (
              <span class="profile-detail"> &middot; {playerTitleName.value}</span>
            )}
          </div>
        ) : (
          <span class="warning">Not verified</span>
        )}
      </div>

      <div class="card">
        <div class="profile-label">Discord Account</div>
        {user.discordId ? (
          <span class="success">{user.discordUsername ?? "Linked"}</span>
        ) : (
          <button
            class="btn-link-discord"
            onClick={() => {
              const token = authToken.value;
              if (token) {
                const baseUrl = getApiBaseUrl();
                window.open(`${baseUrl}/api/auth/discord?token=${encodeURIComponent(token)}`, "_blank");
              }
            }}
          >
            Link Discord Account
          </button>
        )}
      </div>

      <div class="card">
        <div class="profile-label">Server Connection</div>
        <span class={connected ? "success" : "error"}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div class="card">
        <div class="profile-label">Theme</div>
        <button class="theme-toggle-btn" onClick={toggleTheme}>
          {theme === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}
          {theme === "dark" ? "Switch to Light" : "Switch to Dark"}
        </button>
      </div>

      <button class="btn-logout" onClick={logout}>
        <IconLogOut size={14} /> Logout
      </button>
    </div>
  );
}
