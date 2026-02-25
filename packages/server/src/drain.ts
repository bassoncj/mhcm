const DRAIN_POLL_INTERVAL_MS = 1_000;
const DRAIN_TIMEOUT_MS = 120_000; // 2 min max wait

let draining = false;
let drainStartTime = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

type CountFn = () => number;
const counters: CountFn[] = [];

export function registerDrainableCounter(fn: CountFn): void {
  counters.push(fn);
}

export function isDraining(): boolean {
  return draining;
}

export interface DrainProgress {
  draining: boolean;
  remaining: number;
  elapsed: number;
}

export function getDrainProgress(): DrainProgress {
  if (!draining) return { draining: false, remaining: 0, elapsed: 0 };
  const remaining = counters.reduce((sum, fn) => sum + fn(), 0);
  const elapsed = Math.round((Date.now() - drainStartTime) / 1000);
  return { draining: true, remaining, elapsed };
}

/**
 * Start graceful drain.
 * @param broadcastFn Called every poll with progress (send to admin clients).
 * @param exitFn Called when remaining = 0 or timeout (do the actual exit).
 */
export function startDrain(
  broadcastFn: (progress: DrainProgress) => void,
  exitFn: () => void,
): void {
  if (draining) return; // already draining

  draining = true;
  drainStartTime = Date.now();

  console.log("[drain] graceful drain started");

  const initial = getDrainProgress();
  broadcastFn(initial);
  if (initial.remaining === 0) {
    console.log("[drain] no active transactions, exiting immediately");
    cleanup();
    exitFn();
    return;
  }

  pollTimer = setInterval(() => {
    const progress = getDrainProgress();
    broadcastFn(progress);

    if (progress.remaining === 0) {
      console.log(`[drain] all transactions drained after ${progress.elapsed}s`);
      cleanup();
      exitFn();
    }
  }, DRAIN_POLL_INTERVAL_MS);

  timeoutTimer = setTimeout(() => {
    const progress = getDrainProgress();
    console.log(`[drain] timeout after ${DRAIN_TIMEOUT_MS / 1000}s, ${progress.remaining} transactions remaining – force exiting`);
    cleanup();
    exitFn();
  }, DRAIN_TIMEOUT_MS);
}

export function cancelDrain(): boolean {
  if (!draining) return false;
  console.log("[drain] drain cancelled");
  cleanup();
  draining = false;
  return true;
}

export function forceDrain(exitFn: () => void): void {
  console.log("[drain] force drain – exiting immediately");
  cleanup();
  draining = false;
  exitFn();
}

function cleanup(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
}
