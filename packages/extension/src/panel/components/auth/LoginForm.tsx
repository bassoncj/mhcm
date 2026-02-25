import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { authLoading, authError, authToken, currentUser, mhAccount } from "../../signals/auth.js";
import { getApiBaseUrl } from "../../hooks/useAuth.js";
import { getPlatform } from "../../platform/index.js";

const showTestLogin = signal(false);
const testUsername = signal("");
const testPassword = signal("");
const testError = signal<string | null>(null);

export function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  // Listen for auth response from Discord OAuth popup
  useEffect(() => {
    const expectedOrigin = new URL(getApiBaseUrl()).origin;
    const handleMessage = (event: MessageEvent) => {
      // Validate origin — only accept messages from our server's OAuth callback
      if (event.origin !== expectedOrigin) return;
      if (event.data?.type === "mhcm_discord_auth" && event.data.data) {
        const data = event.data.data;
        // Apply auth response
        authToken.value = data.token;
        currentUser.value = data.user;
        mhAccount.value = data.mhAccount;
        authLoading.value = false;

        // Persist to storage
        const platform = getPlatform();
        platform.setStorage("mhcm_auth_token", data.token);
        platform.setStorage("mhcm_auth_user", data.user);
        platform.setStorage("mhcm_auth_mh_account", data.mhAccount);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Ctrl+Shift+T reveals hidden test login (for Chrome Web Store review)
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        showTestLogin.value = true;
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const handleDiscordSignIn = () => {
    authLoading.value = true;
    authError.value = null;

    const baseUrl = getApiBaseUrl();
    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      `${baseUrl}/api/auth/discord?extensionOrigin=${encodeURIComponent(window.location.origin)}`,
      "discord_auth",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    // Reset loading state after a timeout in case popup is closed without completing
    setTimeout(() => {
      if (authLoading.value && !authToken.value) {
        authLoading.value = false;
      }
    }, 60000);
  };

  const handleTestLogin = async (e: Event) => {
    e.preventDefault();
    testError.value = null;
    authLoading.value = true;

    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: testUsername.value,
          password: testPassword.value,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        testError.value = data.error || "Login failed";
        authLoading.value = false;
        return;
      }

      authToken.value = data.token;
      currentUser.value = data.user;
      mhAccount.value = data.mhAccount;
      authLoading.value = false;

      const platform = getPlatform();
      platform.setStorage("mhcm_auth_token", data.token);
      platform.setStorage("mhcm_auth_user", data.user);
      platform.setStorage("mhcm_auth_mh_account", data.mhAccount);
    } catch {
      testError.value = "Connection failed";
      authLoading.value = false;
    }
  };

  return (
    <div class="auth-form discord-auth">
      <h2>Sign In</h2>
      {authError.value && <div class="error">{authError.value}</div>}

      <button
        class="btn-discord"
        onClick={handleDiscordSignIn}
        disabled={authLoading.value}
      >
        <svg width="20" height="20" viewBox="0 0 71 55" fill="currentColor">
          <path d="M60.1 4.9A58.5 58.5 0 0045.4.5a.2.2 0 00-.2.1 40.6 40.6 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.6a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.4.2.2 0 00-.1.1A60.2 60.2 0 00.4 45.3a.2.2 0 00.1.2 58.7 58.7 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.6 38.6 0 01-5.5-2.6.2.2 0 010-.4l1.1-.9a.2.2 0 01.2 0 41.9 41.9 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.6.2.2 0 00-.1.3 47 47 0 003.6 5.9.2.2 0 00.2.1 58.5 58.5 0 0017.8-9 .2.2 0 00.1-.2c1.5-15.3-2.5-28.6-10.4-40.4a.2.2 0 00-.1-.1zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2 0-4 2.8-7.1 6.4-7.1 3.6 0 6.5 3.2 6.4 7.1 0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2 0-4 2.8-7.1 6.4-7.1 3.6 0 6.5 3.2 6.4 7.1 0 4-2.8 7.2-6.4 7.2z"/>
        </svg>
        {authLoading.value ? "Signing in..." : "Sign in with Discord"}
      </button>

      <p class="auth-info">
        You must be a member of the MouseHunt Discord server to sign in.
      </p>

      {showTestLogin.value && (
        <form class="test-login" onSubmit={handleTestLogin}>
          <hr style="border: none; border-top: 1px solid var(--border); margin: 16px 0;" />
          {testError.value && <div class="error">{testError.value}</div>}
          <label>
            Username
            <input
              type="text"
              value={testUsername.value}
              onInput={(e) => { testUsername.value = (e.target as HTMLInputElement).value; }}
              autocomplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={testPassword.value}
              onInput={(e) => { testPassword.value = (e.target as HTMLInputElement).value; }}
              autocomplete="current-password"
            />
          </label>
          <button
            type="submit"
            class="btn btn-primary"
            style="width: 100%; margin-top: 8px;"
            disabled={authLoading.value}
          >
            {authLoading.value ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}
