import { useState, useMemo, useRef, useEffect } from "preact/hooks";
import type { AlertType, AdminAlert } from "@mhcm/shared";
import { adminAlerts, versionAlertEnabled } from "../../signals/alerts.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { renderMarkdownLinks } from "../../utils/markdown.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import {
  IconBell,
  IconAlertTriangle,
  IconSettings,
  IconHelpCircle,
  IconWand,
  IconArrowLeft,
  IconChevronDown,
} from "../common/Icons.js";

const ALERT_TYPES: { value: AlertType; label: string; icon: any; colorClass: string }[] = [
  { value: "announcement", label: "Announcement", icon: IconBell, colorClass: "announcement" },
  { value: "warning", label: "Warning", icon: IconAlertTriangle, colorClass: "warning" },
  { value: "maintenance", label: "Maintenance", icon: IconSettings, colorClass: "maintenance" },
  { value: "info", label: "Information", icon: IconHelpCircle, colorClass: "info" },
  { value: "beta", label: "Beta", icon: IconWand, colorClass: "beta" },
];

function getAlertConfig(type: AlertType) {
  return ALERT_TYPES.find((t) => t.value === type) ?? ALERT_TYPES[0];
}

function formatDateRange(startsAt: string, endsAt: string): string {
  const fmt = (d: string) => {
    const date = new Date(d + "Z");
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };
  return `${fmt(startsAt)} – ${fmt(endsAt)}`;
}

function splitDateTime(iso: string): { date: string; time: string } {
  const [date, timePart] = iso.split("T");
  return { date, time: timePart?.slice(0, 5) ?? "00:00" };
}

function combineDateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

type ViewState = { mode: "list" } | { mode: "create" } | { mode: "edit"; alert: AdminAlert };

export function AlertsManager() {
  const [view, setView] = useState<ViewState>({ mode: "list" });
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Form state
  const [alertType, setAlertType] = useState<AlertType>("announcement");
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("00:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("23:59");
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  const alerts = adminAlerts.value;

  const { active, planned, ended } = useMemo(() => {
    const now = new Date();
    const active: AdminAlert[] = [];
    const planned: AdminAlert[] = [];
    const ended: AdminAlert[] = [];

    for (const a of alerts) {
      const starts = new Date(a.startsAt + "Z");
      const ends = new Date(a.endsAt + "Z");
      if (ends < now) ended.push(a);
      else if (starts > now) planned.push(a);
      else active.push(a);
    }

    active.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    planned.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    ended.sort((a, b) => b.endsAt.localeCompare(a.endsAt));

    return { active, planned, ended };
  }, [alerts]);

  const resetForm = () => {
    setAlertType("announcement");
    setMessage("");
    setStartDate("");
    setStartTime("00:00");
    setEndDate("");
    setEndTime("23:59");
    setTypeDropdownOpen(false);
  };

  const openCreate = () => {
    resetForm();
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    setStartDate(now.toISOString().slice(0, 10));
    setStartTime(now.toISOString().slice(11, 16));
    setEndDate(tomorrow.toISOString().slice(0, 10));
    setEndTime(tomorrow.toISOString().slice(11, 16));
    setView({ mode: "create" });
  };

  const openEdit = (alert: AdminAlert) => {
    const start = splitDateTime(alert.startsAt);
    const end = splitDateTime(alert.endsAt);
    setAlertType(alert.alertType);
    setMessage(alert.message);
    setStartDate(start.date);
    setStartTime(start.time);
    setEndDate(end.date);
    setEndTime(end.time);
    setTypeDropdownOpen(false);
    setView({ mode: "edit", alert });
  };

  const handleSubmit = () => {
    const startsAt = combineDateTime(startDate, startTime);
    const endsAt = combineDateTime(endDate, endTime);
    if (!message.trim() || !startDate || !endDate) return;

    if (view.mode === "create") {
      wsSend({
        type: "admin_create_alert",
        payload: { message: message.trim(), alertType, startsAt, endsAt },
      });
    } else if (view.mode === "edit") {
      wsSend({
        type: "admin_update_alert",
        payload: { alertId: view.alert.id, message: message.trim(), alertType, startsAt, endsAt },
      });
    }
    setView({ mode: "list" });
  };

  const handleDelete = (alertId: number) => {
    wsSend({ type: "admin_delete_alert", payload: { alertId } });
    setDeleteTarget(null);
  };

  if (view.mode === "create" || view.mode === "edit") {
    const isEdit = view.mode === "edit";
    const selectedConfig = getAlertConfig(alertType);
    const Icon = selectedConfig.icon;

    return (
      <div class="alerts-manager">
        <h3 class="alerts-form-title">{isEdit ? "EDIT ALERT" : "CREATE ALERT"}</h3>

        <div class="alerts-form">
          <label class="alerts-label">Type</label>
          <AlertTypeSelector
            value={alertType}
            open={typeDropdownOpen}
            onToggle={() => setTypeDropdownOpen(!typeDropdownOpen)}
            onSelect={(type) => { setAlertType(type); setTypeDropdownOpen(false); }}
          />

          <label class="alerts-label">Message</label>
          <textarea
            class="alerts-textarea"
            rows={6}
            value={message}
            onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
            placeholder="Alert message..."
          />
          <span class="alerts-hint">Supports **bold** and [links](url)</span>

          <div class="alerts-date-row">
            <div class="alerts-date-field">
              <label class="alerts-label">Start</label>
              <input
                type="datetime-local"
                class="alerts-input"
                value={`${startDate}T${startTime}`}
                onInput={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  if (val) {
                    setStartDate(val.slice(0, 10));
                    setStartTime(val.slice(11, 16));
                  }
                }}
              />
            </div>
            <div class="alerts-date-field">
              <label class="alerts-label">End</label>
              <input
                type="datetime-local"
                class="alerts-input"
                value={`${endDate}T${endTime}`}
                onInput={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  if (val) {
                    setEndDate(val.slice(0, 10));
                    setEndTime(val.slice(11, 16));
                  }
                }}
              />
            </div>
          </div>

          <label class="alerts-label">Preview</label>
          <div class={`alert-preview ${selectedConfig.colorClass}`}>
            <div class="alert-preview-icon"><Icon size={24} /></div>
            <div class="alert-preview-title">{selectedConfig.label}</div>
            <div class="alert-preview-message">
              {message ? renderMarkdownLinks(message) : <span class="text-muted">No message</span>}
            </div>
            <div class="alert-preview-btn">Acknowledge</div>
          </div>

          <div class="alerts-form-actions">
            <button class="btn-small" onClick={() => setView({ mode: "list" })}>Cancel</button>
            <button
              class="btn-small btn-accent"
              disabled={!message.trim() || !startDate || !endDate}
              onClick={handleSubmit}
            >
              {isEdit ? "Save Changes" : "Create Alert"}
            </button>
          </div>
        </div>

        <button type="button" class="back-btn" onClick={() => setView({ mode: "list" })}>
          <IconArrowLeft size={14} /> Back to Alerts
        </button>
      </div>
    );
  }

  return (
    <div class="alerts-manager">
      <div class="admin-toggle-row">
        <span>Version mismatch alerts</span>
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked={versionAlertEnabled.value}
            onChange={(e) => {
              wsSend({
                type: "admin_set_version_alert",
                payload: { enabled: (e.target as HTMLInputElement).checked },
              });
            }}
          />
          <span class="toggle-slider" />
        </label>
      </div>

      <button class="btn-small btn-accent alerts-create-btn" onClick={openCreate}>
        + Create Alert
      </button>

      {alerts.length === 0 && (
        <p class="empty">No alerts created yet.</p>
      )}

      {active.length > 0 && (
        <AlertSection title="Active" alerts={active} onEdit={openEdit} onDelete={setDeleteTarget} />
      )}
      {planned.length > 0 && (
        <AlertSection title="Planned" alerts={planned} onEdit={openEdit} onDelete={setDeleteTarget} />
      )}
      {ended.length > 0 && (
        <AlertSection title="Ended" alerts={ended} onDelete={setDeleteTarget} muted />
      )}

      {deleteTarget !== null && (
        <ConfirmModal
          title="Delete Alert"
          confirmLabel="Delete"
          confirmClass="danger"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        >
          <p>Delete this alert? This cannot be undone.</p>
        </ConfirmModal>
      )}
    </div>
  );
}

function AlertTypeSelector({
  value,
  open,
  onToggle,
  onSelect,
}: {
  value: AlertType;
  open: boolean;
  onToggle: () => void;
  onSelect: (type: AlertType) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selected = getAlertConfig(value);
  const SelectedIcon = selected.icon;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div class="alert-type-selector" ref={ref}>
      <button
        type="button"
        class={`alert-type-trigger${open ? " open" : ""}`}
        onClick={onToggle}
      >
        <span class={`alert-type-icon ${selected.colorClass}`}>
          <SelectedIcon size={14} />
        </span>
        <span class="alert-type-trigger-label">{selected.label}</span>
        <span class="alert-type-chevron"><IconChevronDown size={12} /></span>
      </button>
      {open && (
        <div class="alert-type-dropdown">
          {ALERT_TYPES.map((t) => {
            const TypeIcon = t.icon;
            return (
              <button
                type="button"
                key={t.value}
                class={`alert-type-option${t.value === value ? " selected" : ""}`}
                onClick={() => onSelect(t.value)}
              >
                <span class={`alert-type-icon ${t.colorClass}`}>
                  <TypeIcon size={14} />
                </span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlertSection({
  title,
  alerts,
  onEdit,
  onDelete,
  muted,
}: {
  title: string;
  alerts: AdminAlert[];
  onEdit?: (alert: AdminAlert) => void;
  onDelete: (id: number) => void;
  muted?: boolean;
}) {
  return (
    <div class={`alerts-section${muted ? " muted" : ""}`}>
      <h4 class="alerts-section-title">{title} ({alerts.length})</h4>
      {alerts.map((alert) => {
        const config = getAlertConfig(alert.alertType);
        const Icon = config.icon;
        return (
          <div class={`alert-card ${config.colorClass}`} key={alert.id}>
            <div class="alert-card-header">
              <span class={`alert-type-badge ${config.colorClass}`}>
                <Icon size={12} /> {config.label}
              </span>
              <span class="alert-card-by">by {alert.createdBy}</span>
            </div>
            <div class="alert-card-message">{alert.message}</div>
            <div class="alert-card-dates">{formatDateRange(alert.startsAt, alert.endsAt)}</div>
            <div class="alert-card-actions">
              {onEdit && (
                <button class="btn-small" onClick={() => onEdit(alert)}>Edit</button>
              )}
              <button class="btn-small btn-danger-outline" onClick={() => onDelete(alert.id)}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
