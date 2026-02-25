import type { AlertType } from "@mhcm/shared";
import { activeAlert, versionOutdated } from "../../signals/alerts.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { renderMarkdownLinks } from "../../utils/markdown.js";
import {
  IconBell,
  IconAlertTriangle,
  IconSettings,
  IconHelpCircle,
  IconWand,
  IconRefreshCw,
} from "./Icons.js";

const ALERT_CONFIG: Record<AlertType | "update", { icon: any; title: string; colorClass: string }> = {
  announcement: { icon: IconBell, title: "Announcement", colorClass: "announcement" },
  warning: { icon: IconAlertTriangle, title: "Warning", colorClass: "warning" },
  maintenance: { icon: IconSettings, title: "Maintenance", colorClass: "maintenance" },
  info: { icon: IconHelpCircle, title: "Information", colorClass: "info" },
  beta: { icon: IconWand, title: "Beta", colorClass: "beta" },
  update: { icon: IconRefreshCw, title: "Update Available", colorClass: "update" },
};

export function AlertOverlay() {
  const version = versionOutdated.value;
  const alert = activeAlert.value;

  // Version alert takes priority over admin alerts
  if (version) {
    const config = ALERT_CONFIG.update;
    const Icon = config.icon;

    return (
      <div class="alert-overlay">
        <div class={`alert-overlay-card ${config.colorClass}`}>
          <div class="alert-overlay-icon">
            <Icon size={32} />
          </div>
          <h3 class="alert-overlay-title">{config.title}</h3>
          <div class="alert-overlay-message">
            <p>A newer version of the extension is available.</p>
            <div class="alert-overlay-versions">
              <span>You have: <strong>v{version.extensionVersion}</strong></span>
              <span>Latest: <strong>v{version.serverVersion}</strong></span>
            </div>
            <p>Please update to ensure compatibility.</p>
          </div>
          <button
            class="alert-overlay-dismiss"
            onClick={() => {
              wsSend({ type: "dismiss_version_alert" });
              versionOutdated.value = null;
            }}
          >
            I'll Update Later
          </button>
        </div>
      </div>
    );
  }

  if (!alert) return null;

  const config = ALERT_CONFIG[alert.alertType] ?? ALERT_CONFIG.info;
  const Icon = config.icon;

  return (
    <div class="alert-overlay">
      <div class={`alert-overlay-card ${config.colorClass}`}>
        <div class="alert-overlay-icon">
          <Icon size={32} />
        </div>
        <h3 class="alert-overlay-title">{config.title}</h3>
        <div class="alert-overlay-message">
          {renderMarkdownLinks(alert.message)}
        </div>
        <button
          class="alert-overlay-dismiss"
          onClick={() => {
            wsSend({ type: "acknowledge_alert", payload: { alertId: alert.id } });
            activeAlert.value = null;
          }}
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
}
