import type { Platform, MessageHandler } from "./interface.js";

export class ChromePlatform implements Platform {
  async sendMessage(message: any): Promise<any> {
    return chrome.runtime.sendMessage(message);
  }

  onMessage(handler: MessageHandler): () => void {
    const listener = (message: any) => {
      handler(message);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }

  async getStorage<T = any>(key: string): Promise<T | undefined> {
    const data = await chrome.storage.local.get([key]);
    return data[key] as T | undefined;
  }

  async setStorage(key: string, value: any): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  async removeStorage(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }
}
