import { useEffect } from "preact/hooks";
import type { AuthResponse } from "@mhcm/shared";
import { getPlatform } from "../platform/index.js";
import {
  authToken,
  currentUser,
  mhAccount,
  authLoading,
  authError,
} from "../signals/auth.js";
import { DEFAULT_SERVER_URL } from "../../shared/constants.js";

/** Convert WebSocket URL to HTTP URL. */
function wsToHttp(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

/** Base URL for the HTTP API - derived from the WS URL in storage. */
async function getApiBaseUrlAsync(): Promise<string> {
  const wsUrl = await getPlatform().getStorage<string>("mhcm_server_url");
  return wsToHttp(wsUrl || DEFAULT_SERVER_URL);
}

/** Synchronous version for use in click handlers - uses default if storage not available. */
export function getApiBaseUrl(): string {
  return wsToHttp(DEFAULT_SERVER_URL);
}

async function apiPost(
  path: string,
  body: any,
  token?: string
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const baseUrl = await getApiBaseUrlAsync();
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function applyAuthResponse(data: AuthResponse): void {
  authToken.value = data.token;
  currentUser.value = data.user;
  mhAccount.value = data.mhAccount;

  // Persist full auth state so sidebar can restore without re-login
  const platform = getPlatform();
  platform.setStorage("mhcm_auth_token", data.token);
  platform.setStorage("mhcm_auth_user", data.user);
  platform.setStorage("mhcm_auth_mh_account", data.mhAccount);
}

export async function login(username: string, password: string): Promise<void> {
  authLoading.value = true;
  authError.value = null;
  try {
    const data = await apiPost("/api/auth/login", { username, password });
    applyAuthResponse(data);
  } catch (err) {
    authError.value = err instanceof Error ? err.message : "Login failed";
  } finally {
    authLoading.value = false;
  }
}

export async function register(
  username: string,
  password: string
): Promise<void> {
  authLoading.value = true;
  authError.value = null;
  try {
    const data = await apiPost("/api/auth/register", { username, password });
    applyAuthResponse(data);
  } catch (err) {
    authError.value = err instanceof Error ? err.message : "Registration failed";
  } finally {
    authLoading.value = false;
  }
}

export function logout(): void {
  authToken.value = null;
  currentUser.value = null;
  mhAccount.value = null;
  const platform = getPlatform();
  platform.removeStorage("mhcm_auth_token");
  platform.removeStorage("mhcm_auth_user");
  platform.removeStorage("mhcm_auth_mh_account");
}

export function useAuth(): void {
  useEffect(() => {
    // Restore full auth state from storage
    const platform = getPlatform();
    Promise.all([
      platform.getStorage<string>("mhcm_auth_token"),
      platform.getStorage<AuthResponse["user"]>("mhcm_auth_user"),
      platform.getStorage<AuthResponse["mhAccount"]>("mhcm_auth_mh_account"),
    ]).then(([token, user, mhAcct]) => {
      if (token && user) {
        authToken.value = token;
        currentUser.value = user;
        mhAccount.value = mhAcct ?? null;
      }
    });
  }, []);
}
