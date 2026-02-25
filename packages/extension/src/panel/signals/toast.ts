import { signal } from "@preact/signals";

export interface Toast {
  id: number;
  message: string;
  variant: "success" | "error" | "warn";
  sticky?: boolean;
}

export const toasts = signal<Toast[]>([]);
let nextId = 0;

/** Max visible error toasts before oldest gets auto-removed. */
const MAX_ERROR_TOASTS = 3;

export function showToast(
  message: string,
  variant: Toast["variant"] = "success",
  duration = 3000,
  sticky = false,
): void {
  const id = nextId++;
  let updated = [...toasts.value, { id, message, variant, sticky }];

  // Cap error toasts: remove oldest error when exceeding limit
  if (variant === "error") {
    const errorToasts = updated.filter((t) => t.variant === "error");
    if (errorToasts.length > MAX_ERROR_TOASTS) {
      const oldestErrorId = errorToasts[0].id;
      updated = updated.filter((t) => t.id !== oldestErrorId);
    }
  }

  toasts.value = updated;

  // Sticky toasts never auto-dismiss; error toasts after 30s; others use provided duration
  if (!sticky) {
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, variant === "error" ? 30_000 : duration);
  }
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
