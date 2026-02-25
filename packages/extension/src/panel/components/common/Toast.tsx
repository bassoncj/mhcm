import { toasts, dismissToast } from "../../signals/toast.js";
import { IconCheck, IconX, IconAlertTriangle } from "./Icons.js";

function ToastIcon({ variant }: { variant: string }) {
  if (variant === "success") return <IconCheck size={14} />;
  if (variant === "error") return <IconX size={14} />;
  return <IconAlertTriangle size={14} />;
}

export function ToastContainer() {
  if (toasts.value.length === 0) return null;

  return (
    <div class="toast-container">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast toast-${t.variant}`}>
          <ToastIcon variant={t.variant} />
          <span>{t.message}</span>
          {(t.variant === "error" || t.sticky) && (
            <button
              class="toast-dismiss"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
            >
              <IconX size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
