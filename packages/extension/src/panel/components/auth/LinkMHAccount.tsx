import { useState, useEffect } from "preact/hooks";
import { mhAccount, mhLinkPending, mhLinkError, mhLinkVerifyCode, mhLinkVerifying } from "../../signals/auth.js";
import { playerIdentity } from "../../signals/game-state.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { logout } from "../../hooks/useAuth.js";
import { IconLogOut } from "../common/Icons.js";

export function LinkMHAccount() {
  const [copied, setCopied] = useState(false);

  const identity = playerIdentity.value;
  const pending = mhLinkPending.value;
  const error = mhLinkError.value;
  const verifyCode = mhLinkVerifyCode.value;
  const verifying = mhLinkVerifying.value;

  // Auto-initiate link when identity is detected and no code yet
  useEffect(() => {
    if (identity && !verifyCode && !pending && !error) {
      mhLinkPending.value = true;
      wsSend({
        type: "confirm_mh_link",
        payload: {
          mhUserId: identity.userId,
          mhSnUserId: identity.snUserId,
        },
      });
    }
  }, [identity?.userId]);

  // No MH identity detected
  if (!identity) {
    return (
      <div class="link-mh-account">
        <h2>Link MouseHunt Account</h2>
        <p class="info">
          Open mousehuntgame.com in a tab to detect your MouseHunt identity.
        </p>
        <button class="btn-logout" onClick={logout}>
          <IconLogOut size={14} /> Sign out
        </button>
      </div>
    );
  }

  // Already linked and verified
  if (mhAccount.value?.verified) {
    return (
      <div class="link-mh-account">
        <h2>MouseHunt Account</h2>
        <p class="success">Account linked</p>
        <p>Hunter ID: {mhAccount.value.mhUserId}</p>
      </div>
    );
  }

  // MH account already linked to another Discord user
  if (error?.code === "already_linked") {
    return (
      <div class="link-mh-account">
        <h2>Cannot Link Account</h2>
        <p class="error">
          This MouseHunt account (Hunter ID: {identity.userId}) is already linked to another user.
        </p>
        <p class="info">
          Each MouseHunt account can only be linked to one marketplace account.
          If you believe this is an error, please contact support.
        </p>
        <button class="btn-logout" onClick={logout}>
          <IconLogOut size={14} /> Sign out
        </button>
      </div>
    );
  }

  const handleCopy = () => {
    if (!verifyCode) return;
    const textarea = document.createElement("textarea");
    textarea.value = verifyCode;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = () => {
    mhLinkVerifying.value = true;
    mhLinkError.value = null;
    wsSend({ type: "verify_mh_link", payload: {} });
  };

  // Single screen: code + instructions + verify
  return (
    <div class="link-mh-account">
      <h2>Link MouseHunt Account</h2>
      <p class="hunter-info">
        <strong>Hunter ID:</strong> {identity.userId}
      </p>
      {pending && !verifyCode ? (
        <p class="info">Setting up verification...</p>
      ) : verifyCode ? (
        <>
          <p class="info" style={{ marginBottom: "12px" }}>
            Post this code to your MouseHunt corkboard, then click Verify.
          </p>
          <div class="code-input-row">
            <input type="text" value={verifyCode} readOnly />
            <button class="btn-secondary" onClick={handleCopy} style={{ whiteSpace: "nowrap" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <ol class="verify-steps">
            <li>Go to your <strong>Hunter Profile</strong> on mousehuntgame.com</li>
            <li>Post the code above to your <strong>corkboard</strong></li>
            <li>Click <strong>Verify</strong> below</li>
          </ol>
          {error && !error.code && (
            <p class="error" style={{ marginBottom: "8px" }}>{error.message}</p>
          )}
          <div class="button-row">
            <button onClick={handleVerify} disabled={verifying} class="btn-primary">
              {verifying ? "Checking..." : "Verify"}
            </button>
          </div>
          <p class="warning" style={{ marginTop: "12px", fontSize: "11px" }}>
            This link is permanent and cannot be changed or removed.
          </p>
        </>
      ) : error ? (
        <>
          <p class="error">{error.message}</p>
          <div class="button-row">
            <button
              class="btn-primary"
              onClick={() => {
                mhLinkPending.value = true;
                mhLinkError.value = null;
                wsSend({
                  type: "confirm_mh_link",
                  payload: { mhUserId: identity.userId, mhSnUserId: identity.snUserId },
                });
              }}
            >
              Retry
            </button>
          </div>
        </>
      ) : null}
      <button class="btn-logout" onClick={logout} style={{ marginTop: "16px" }}>
        <IconLogOut size={14} /> Sign out
      </button>
    </div>
  );
}
