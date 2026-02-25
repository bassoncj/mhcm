import { useEffect, useState } from "preact/hooks";
import { activeRiskCheck } from "../../signals/risk-check.js";
import { wsSend } from "../../hooks/useServiceWorker.js";

export function RiskCheckModal() {
  const check = activeRiskCheck.value;
  if (!check) return null;

  if (check.status === "timed_out") {
    return <TimedOutView />;
  }

  return <RiskPromptView />;
}

function RiskPromptView() {
  const check = activeRiskCheck.value!;
  const [countdown, setCountdown] = useState(check.timeoutSeconds);

  useEffect(() => {
    setCountdown(check.timeoutSeconds);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [check.transactionId]);

  const atRiskTypes = new Set(check.atRiskGoals.map((g) => g.type));
  const atRiskReasonMap = new Map(check.atRiskGoals.map((g) => [g.type, g.reason]));
  const hasRisk = check.atRiskGoals.length > 0;

  function handleAccept() {
    wsSend({
      type: "risk_check_response",
      payload: { transactionId: check.transactionId, marketplace: check.marketplace, decision: "accepted" },
    });
    activeRiskCheck.value = null;
  }

  function handleReject() {
    wsSend({
      type: "risk_check_response",
      payload: { transactionId: check.transactionId, marketplace: check.marketplace, decision: "rejected" },
    });
    activeRiskCheck.value = null;
  }

  return (
    <div class="modal-overlay">
      <div class="modal-content risk-check-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header risk-check-header">
          Goal Risk Warning
        </div>
        <div class="modal-body">
          <p class="risk-check-desc">
            {hasRisk
              ? "You have been matched with a map that has remaining goals you may be at risk of completing."
              : "You have been matched with a map with remaining goals. No immediate risk was detected, but please review before proceeding."}
          </p>

          <div class="risk-check-goals">
            {check.remainingGoals.map((goal) => {
              const isAtRisk = atRiskTypes.has(goal.type);
              const reason = atRiskReasonMap.get(goal.type);
              return (
                <div
                  key={goal.uniqueId}
                  class={`risk-goal-row ${isAtRisk ? "at-risk" : ""}`}
                >
                  <div class="risk-goal-info">
                    {goal.thumbnail && (
                      <img
                        src={goal.thumbnail}
                        alt=""
                        class="mouse-thumb-sm"
                      />
                    )}
                    <span class="risk-goal-name">{goal.name}</span>
                  </div>
                  {isAtRisk ? (
                    <div class="risk-goal-badge">
                      <span class="risk-badge-icon">!</span>
                      <span class="risk-badge-text">RISK</span>
                    </div>
                  ) : (
                    <span class="risk-goal-safe">(no risk detected)</span>
                  )}
                  {isAtRisk && reason && (
                    <div class="risk-goal-reason">{reason}</div>
                  )}
                </div>
              );
            })}
          </div>

          {hasRisk && (
            <p class="risk-check-warning">
              By accepting, you confirm you have taken steps to avoid catching
              at-risk goals. Accidental map completion is your responsibility.
            </p>
          )}

          <div class="risk-check-timer">
            {countdown}s remaining
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-btn cancel" onClick={handleReject}>
            Reject
          </button>
          <button
            type="button"
            class={`modal-btn confirm ${hasRisk ? "danger" : ""}`}
            onClick={handleAccept}
          >
            {hasRisk ? "Accept Risk" : "Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimedOutView() {
  const check = activeRiskCheck.value!;

  function handleRetry() {
    wsSend({
      type: "risk_check_retry",
      payload: {
        marketplace: check.marketplace,
        buyOrderId: check.buyOrderId!,
        sellOrderId: check.sellOrderId!,
        mapTypeId: check.mapTypeId,
      },
    });
    activeRiskCheck.value = null;
  }

  function handleDismiss() {
    activeRiskCheck.value = null;
  }

  return (
    <div class="modal-overlay">
      <div class="modal-content risk-check-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          Risk Check Timed Out
        </div>
        <div class="modal-body">
          <p class="risk-check-desc">
            The risk check expired before you responded. This match has been
            blocked.
          </p>
          <p class="risk-check-desc">
            Would you like to try matching with this sell order again?
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-btn cancel" onClick={handleDismiss}>
            No Thanks
          </button>
          <button type="button" class="modal-btn confirm" onClick={handleRetry}>
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
