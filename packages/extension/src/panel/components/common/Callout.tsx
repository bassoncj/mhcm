import type { ComponentChildren } from "preact";
import { IconLoader } from "./Icons.js";

export type CalloutVariant = "info" | "warning" | "error";

interface CalloutProps {
  variant?: CalloutVariant;
  loading?: boolean;
  children: ComponentChildren;
}

export function Callout({ variant = "info", loading = false, children }: CalloutProps) {
  return (
    <div class={`callout callout-${variant}${loading ? " callout-loading" : ""}`}>
      {loading && <IconLoader size={12} class="callout-spinner" />}
      {children}
    </div>
  );
}
