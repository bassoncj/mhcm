export type MessageHandler = (message: any) => void;

export interface Platform {
  /**
   * Send a message to the backend bridge (service worker in extension,
   * direct WebSocket in standalone).
   */
  sendMessage(message: any): Promise<any>;

  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage(handler: MessageHandler): () => void;

  /** Read a value from persistent storage. */
  getStorage<T = any>(key: string): Promise<T | undefined>;

  /** Write a value to persistent storage. */
  setStorage(key: string, value: any): Promise<void>;

  /** Remove a value from persistent storage. */
  removeStorage(key: string): Promise<void>;
}
