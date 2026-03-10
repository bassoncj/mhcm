// Serial queue for MH game API calls with random inter-call delay.
// Prevents rate limiting by the MH server when transaction flows
// make many rapid sequential calls to the same endpoints.

interface QueueEntry {
  fn: (...args: any[]) => Promise<any>;
  args: any[];
  requestId: string;
  sendResponse: (response: any) => void;
}

const queue: QueueEntry[] = [];
let processing = false;
let lastCallCompletedAt = 0;

const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 2000;

function randomGap(): number {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

export function enqueueApiCall(
  fn: (...args: any[]) => Promise<any>,
  args: any[],
  requestId: string,
  sendResponse: (response: any) => void
): void {
  queue.push({ fn, args, requestId, sendResponse });
  if (!processing) {
    processQueue();
  }
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const entry = queue.shift()!;

    // Enforce minimum gap since last call, even if queue was empty between calls
    if (lastCallCompletedAt > 0) {
      const elapsed = Date.now() - lastCallCompletedAt;
      const required = randomGap();
      if (elapsed < required) {
        await new Promise<void>((r) => setTimeout(r, required - elapsed));
      }
    }

    try {
      const data = await entry.fn(...entry.args);
      entry.sendResponse({ requestId: entry.requestId, success: true, data });
    } catch (err) {
      entry.sendResponse({
        requestId: entry.requestId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    lastCallCompletedAt = Date.now();
  }

  processing = false;
}
