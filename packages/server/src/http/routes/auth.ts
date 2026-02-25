import type { ServerResponse } from "http";
import bcrypt from "bcrypt";
import type { AuthenticatedRequest } from "../../auth/middleware.js";
import { createToken, verifyToken } from "../../auth/sessions.js";
import { config } from "../../config.js";
import { createUser, createUserFromDiscord, findUserByUsername, findUserById, findUserByDiscordId, updateUserDiscord } from "../../db/queries/users.js";
import { findMHAccountByUserId } from "../../db/queries/mh-accounts.js";
import { isDiscordIdAllowed } from "../../db/queries/allowed-testers.js";
import { jsonResponse, parseBody } from "../router.js";
import { audit } from "../../audit.js";
import { isClosedBetaEnabled } from "../../settings.js";
import { insertOnboardingTasksForNewUser } from "../../db/queries/onboarding.js";

const DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_API_URL = "https://discord.com/api/v10";

export async function handleRegister(
  req: AuthenticatedRequest,
  res: ServerResponse
): Promise<void> {
  const body = await parseBody(req);
  const { username, password } = body;

  if (!username || !password) {
    jsonResponse(res, 400, { error: "Username and password required" });
    return;
  }

  if (typeof username !== "string" || username.length < 3 || username.length > 30) {
    jsonResponse(res, 400, { error: "Username must be 3-30 characters" });
    return;
  }

  if (typeof password !== "string" || password.length < 8) {
    jsonResponse(res, 400, { error: "Password must be at least 8 characters" });
    return;
  }

  const existing = findUserByUsername(username);
  if (existing) {
    jsonResponse(res, 409, { error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const user = createUser(username, passwordHash);

  const token = createToken({ userId: user.id, username: user.username, role: user.role });

  audit("user_registered", user.id, { username: user.username });

  jsonResponse(res, 201, {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      discordId: user.discord_id,
      discordUsername: user.discord_username,
      createdAt: user.created_at,
    },
    mhAccount: null,
  });
}

export async function handleLogin(
  req: AuthenticatedRequest,
  res: ServerResponse
): Promise<void> {
  const body = await parseBody(req);
  const { username, password } = body;

  if (!username || !password) {
    jsonResponse(res, 400, { error: "Username and password required" });
    return;
  }

  const user = findUserByUsername(username);
  if (!user) {
    jsonResponse(res, 401, { error: "Invalid credentials" });
    return;
  }

  // null password_hash means Discord-only user
  if (!user.password_hash) {
    jsonResponse(res, 401, { error: "This account uses Discord login. Please sign in with Discord." });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    audit("user_login_failed", user.id, { username });
    jsonResponse(res, 401, { error: "Invalid credentials" });
    return;
  }

  if (user.status === "suspended") {
    audit("user_login_failed", user.id, { username, reason: "suspended" });
    jsonResponse(res, 403, { error: "Account suspended" });
    return;
  }

  const token = createToken({ userId: user.id, username: user.username, role: user.role });
  const mhAccount = findMHAccountByUserId(user.id);

  audit("user_login", user.id, { username: user.username, role: user.role });

  jsonResponse(res, 200, {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      discordId: user.discord_id,
      discordUsername: user.discord_username,
      createdAt: user.created_at,
    },
    mhAccount: mhAccount
      ? {
          userId: mhAccount.user_id,
          mhUserId: mhAccount.mh_user_id,
          mhSnUserId: mhAccount.mh_sn_user_id,
          verified: !!mhAccount.verified_at,
          verifiedAt: mhAccount.verified_at,
        }
      : null,
  });
}

/**
 * Initiate the OAuth flow by redirecting to Discord.
 * Query params:
 *   - token: JWT token of logged-in user (for linking existing account)
 */
export function handleDiscordAuth(
  req: AuthenticatedRequest,
  res: ServerResponse
): void {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const extensionOrigin = url.searchParams.get("extensionOrigin") ?? "";

  if (!config.discordClientId) {
    jsonResponse(res, 500, { error: "Discord OAuth not configured" });
    return;
  }

  // Format: "link:<token>|<origin>" or "new|<origin>"
  // Uses | delimiter (not present in JWTs or chrome-extension:// URLs)
  const state = token ? `link:${token}|${extensionOrigin}` : `new|${extensionOrigin}`;

  const params = new URLSearchParams({
    client_id: config.discordClientId,
    redirect_uri: config.discordRedirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
  });

  const discordUrl = `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;

  res.writeHead(302, { Location: discordUrl });
  res.end();
}

/**
 * Handle the callback from Discord.
 * Exchanges code for token, fetches user info and guilds, validates membership.
 */
export async function handleDiscordCallback(
  req: AuthenticatedRequest,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const showError = (message: string) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Discord Link Failed</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #1a1a2e; color: #fff; }
    .error { color: #ff6b6b; font-size: 1.2em; margin: 20px 0; }
    .info { color: #888; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>Discord Link Failed</h1>
  <p class="error">${message}</p>
  <p class="info">You can close this tab and try again from the extension.</p>
</body>
</html>`);
  };

  const showSuccess = (discordUsername: string) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Discord Linked!</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #1a1a2e; color: #fff; }
    .success { color: #51cf66; font-size: 1.2em; margin: 20px 0; }
    .info { color: #888; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>Discord Account Linked!</h1>
  <p class="success">Your Discord account (${discordUsername}) has been linked successfully.</p>
  <p class="info">You can close this tab and return to the extension. You may need to log out and back in to see the change.</p>
</body>
</html>`);
  };

  if (error) {
    showError(`Discord authorization denied: ${error}`);
    return;
  }

  if (!code) {
    showError("No authorization code received from Discord");
    return;
  }

  if (!config.discordClientId || !config.discordClientSecret) {
    showError("Discord OAuth not configured on server");
    return;
  }

  try {
    const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.discordClientId,
        client_secret: config.discordClientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: config.discordRedirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("[discord] token exchange failed:", errText);
      showError("Failed to exchange Discord authorization code");
      return;
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    const accessToken = tokenData.access_token;

    const userResponse = await fetch(`${DISCORD_API_URL}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      showError("Failed to fetch Discord user info");
      return;
    }

    const discordUser = await userResponse.json() as {
      id: string;
      username: string;
      discriminator: string;
      global_name?: string;
    };

    const guildsResponse = await fetch(`${DISCORD_API_URL}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!guildsResponse.ok) {
      showError("Failed to fetch Discord guilds");
      return;
    }

    const guilds = await guildsResponse.json() as Array<{ id: string; name: string }>;

    if (config.mhDiscordGuildId) {
      const isMember = guilds.some((g) => g.id === config.mhDiscordGuildId);
      if (!isMember) {
        showError("You must be a member of the MouseHunt Discord server to use this service");
        return;
      }
    }

    const discordUsername = discordUser.global_name ?? discordUser.username;

    // Parse state: "link:<token>|<origin>" or "new|<origin>"
    const pipeIdx = state?.lastIndexOf("|") ?? -1;
    const extensionOrigin = pipeIdx >= 0 ? state!.slice(pipeIdx + 1) : "";
    const statePrefix = pipeIdx >= 0 ? state!.slice(0, pipeIdx) : (state ?? "");

    if (statePrefix.startsWith("link:")) {
      const jwtToken = statePrefix.slice(5);
      const payload = verifyToken(jwtToken);

      if (!payload) {
        showError("Invalid or expired session. Please log in again and retry.");
        return;
      }

      const existingUser = findUserById(payload.userId);
      if (!existingUser) {
        showError("User not found");
        return;
      }

      updateUserDiscord(payload.userId, discordUser.id, discordUsername);
      audit("discord_linked", payload.userId, { discordId: discordUser.id, discordUsername });

      showSuccess(discordUsername);
    } else {
      let user = findUserByDiscordId(discordUser.id);
      let isNewUser = false;

      if (!user) {
        if (isClosedBetaEnabled() && !isDiscordIdAllowed(discordUser.id)) {
          showError("The marketplace is currently in closed beta. Contact an admin for access.");
          return;
        }

        const isInitialAdmin = config.initialAdminDiscordId && discordUser.id === config.initialAdminDiscordId;
        const role = isInitialAdmin ? "admin" : "user";

        user = createUserFromDiscord(discordUser.id, discordUsername, role);
        isNewUser = true;

        insertOnboardingTasksForNewUser(user.id);

        audit("user_registered", user.id, {
          username: user.username,
          method: "discord",
          discordId: discordUser.id,
          ...(isInitialAdmin && { promotedToAdmin: true })
        });
      }

      if (user.status === "suspended") {
        showError("Account suspended");
        return;
      }

      const token = createToken({
        userId: user.id,
        username: user.username,
        role: user.role
      });
      const mhAccount = findMHAccountByUserId(user.id);

      audit("user_login", user.id, { username: user.username, method: "discord", isNewUser });

      const authData = {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          discordId: user.discord_id,
          discordUsername: user.discord_username,
          createdAt: user.created_at,
        },
        mhAccount: mhAccount
          ? {
              userId: mhAccount.user_id,
              mhUserId: mhAccount.mh_user_id,
              mhSnUserId: mhAccount.mh_sn_user_id,
              verified: !!mhAccount.verified_at,
              verifiedAt: mhAccount.verified_at,
            }
          : null,
      };

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Discord Sign In Successful</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #1a1a2e; color: #fff; }
    .success { color: #51cf66; font-size: 1.2em; margin: 20px 0; }
    .info { color: #888; margin-top: 20px; }
  </style>
  <script>
    const authData = ${JSON.stringify(authData)};
    const targetOrigin = ${JSON.stringify(extensionOrigin || "*")};
    // Send to opener window (popup flow) with restricted origin
    if (window.opener) {
      window.opener.postMessage({ type: 'mhcm_discord_auth', data: authData }, targetOrigin);
      setTimeout(() => window.close(), 1500);
    }
  </script>
</head>
<body>
  <h1>${isNewUser ? "Account Created!" : "Signed In!"}</h1>
  <p class="success">${isNewUser ? `Welcome, ${discordUsername}!` : `Welcome back, ${discordUsername}!`}</p>
  <p class="info">This window will close automatically...</p>
</body>
</html>`);
    }
  } catch (err) {
    console.error("[discord] OAuth callback error:", err);
    showError("An error occurred during Discord authentication");
  }
}
