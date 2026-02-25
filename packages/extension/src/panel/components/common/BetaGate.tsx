import type { MarketType } from "@mhcm/shared";
import { hasPendingBetaRequest } from "../../signals/beta.js";
import { wsSend } from "../../hooks/useServiceWorker.js";

const MARKET_LABELS: Record<MarketType, string> = {
  slots: "Slot Marketplace",
  sniping: "Sniping Marketplace",
  items: "Item Marketplace",
  maps: "Map Marketplace",
};

export function BetaGate({ market }: { market: MarketType }) {
  const pending = hasPendingBetaRequest.value;

  const handleApply = () => {
    wsSend({ type: "apply_for_beta" });
  };

  return (
    <div class="beta-gate">
      <h2>Beta Access Only</h2>
      <p>
        The {MARKET_LABELS[market]} is currently available for beta testing only.
      </p>
      {pending ? (
        <div class="beta-gate-pending">
          <span class="badge badge-warning">Request Pending</span>
          <p>Your request is being reviewed.</p>
        </div>
      ) : (
        <button class="btn btn-primary" onClick={handleApply}>
          Apply for Beta Access
        </button>
      )}
    </div>
  );
}
