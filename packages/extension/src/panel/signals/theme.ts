import { signal } from "@preact/signals";
import { getPlatform } from "../platform/index.js";

export const themeMode = signal<"dark" | "light">("dark");

export function toggleTheme(): void {
  themeMode.value = themeMode.value === "dark" ? "light" : "dark";
  getPlatform().setStorage("mhcm_theme", themeMode.value);
  document.documentElement.setAttribute("data-theme", themeMode.value);
}

/** Restore theme from storage. Called once on panel load. */
export function restoreTheme(): void {
  getPlatform().getStorage<string>("mhcm_theme").then((saved) => {
    if (saved === "light") {
      themeMode.value = "light";
      document.documentElement.setAttribute("data-theme", "light");
    }
  });
}
