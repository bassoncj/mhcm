import { signal, computed } from "@preact/signals";
import type { User, MHAccount } from "@mhcm/shared";

export const authToken = signal<string | null>(null);
export const currentUser = signal<User | null>(null);
export const mhAccount = signal<MHAccount | null>(null);
export const authLoading = signal(false);
export const authError = signal<string | null>(null);

// MH account linking state
export const mhLinkPending = signal(false);
export interface MHLinkError {
  message: string;
  code?: "already_linked";
}
export const mhLinkError = signal<MHLinkError | null>(null);
/** Corkboard verification code shown to user during MH account linking. */
export const mhLinkVerifyCode = signal<string | null>(null);
/** True while we're waiting for the server to check the corkboard. */
export const mhLinkVerifying = signal(false);

export const isLoggedIn = computed(() => !!authToken.value && !!currentUser.value);
export const isVerified = computed(() => !!mhAccount.value?.verified);
export const isAdmin = computed(() => currentUser.value?.role === "admin");
export const isModerator = computed(
  () => currentUser.value?.role === "admin" || currentUser.value?.role === "moderator"
);

// AFK state (orders paused when user hasn't interacted with MH tab for 60 min)
export const isAfk = signal(false);
export const afkWarning = signal(false);  // True when 5 min from AFK

// Game settings validation (null = not yet checked, true = valid, false = invalid)
export const gameSettingsValid = signal<boolean | null>(null);
export const gameSettings = signal<{ allowMapInvites: boolean; allowAnonymousSupplyTransfers: boolean } | null>(null);
