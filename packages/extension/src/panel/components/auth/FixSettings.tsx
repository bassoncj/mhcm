import { useState } from "preact/hooks";
import { IconCheckCircle, IconXCircle, IconSettings } from "../common/Icons.js";
import { sendToWorker } from "../../hooks/useServiceWorker.js";

interface FixSettingsProps {
  settings: { allowMapInvites: boolean; allowAnonymousSupplyTransfers: boolean } | null;
}

export function FixSettings({ settings }: FixSettingsProps) {
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    await sendToWorker({ type: "recheck_game_settings" });
    // Give the round-trip a moment to complete
    setTimeout(() => setChecking(false), 2000);
  };

  const mapInvites = settings?.allowMapInvites ?? false;
  const supplyTransfers = settings?.allowAnonymousSupplyTransfers ?? false;

  return (
    <div class="fix-settings">
      <div class="fix-settings-icon">
        <IconSettings size={24} />
      </div>
      <h2>Game Settings Required</h2>
      <p class="fix-settings-desc">
        The marketplace requires these MouseHunt settings to be enabled for
        transactions to work. Please update them before continuing.
      </p>

      <div class="fix-settings-checklist">
        <div class={`fix-settings-item ${mapInvites ? "ok" : "missing"}`}>
          {mapInvites ? <IconCheckCircle size={16} /> : <IconXCircle size={16} />}
          <span>Allow map invites from anyone</span>
        </div>
        <div class={`fix-settings-item ${supplyTransfers ? "ok" : "missing"}`}>
          {supplyTransfers ? <IconCheckCircle size={16} /> : <IconXCircle size={16} />}
          <span>Allow receiving supplies from anyone</span>
        </div>
      </div>

      <p class="fix-settings-instructions">
        Go to <strong>Settings → Game Settings</strong> on the
        MouseHunt website to enable these options, then click the
        button below.
      </p>

      <button
        class="btn-primary fix-settings-btn"
        onClick={handleCheck}
        disabled={checking}
      >
        {checking ? "Checking..." : "Check Settings"}
      </button>
    </div>
  );
}
