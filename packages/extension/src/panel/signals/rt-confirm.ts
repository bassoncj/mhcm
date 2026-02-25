import { signal } from "@preact/signals";

export interface RtConfirmPrompt {
  transactionId: number;
  sellerName: string;
  sellerSnUserId: string;
}

/** When non-null, show the blocking RT manual confirmation modal. */
export const rtConfirmPrompt = signal<RtConfirmPrompt | null>(null);
