import type { Platform } from "./interface.js";
import { ChromePlatform } from "./chrome.js";

let platform: Platform;

export function getPlatform(): Platform {
  if (!platform) {
    // Detect environment and instantiate the right implementation.
    // For now, only the chrome extension platform exists.
    platform = new ChromePlatform();
  }
  return platform;
}

export type { Platform, MessageHandler } from "./interface.js";
