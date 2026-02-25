import { rtConfirmPrompt } from "../../signals/rt-confirm.js";
import { wsSend } from "../../hooks/useServiceWorker.js";

export function RtConfirmModal() {
  const prompt = rtConfirmPrompt.value;
  if (!prompt) return null;

  const handleConfirm = () => {
    wsSend({
      type: "rt_manual_confirm",
      payload: { transactionId: prompt.transactionId },
    });
    rtConfirmPrompt.value = null;
  };

  return (
    <div class="modal-overlay">
      <div class="modal rt-confirm-modal">
        <h2>Return Tradables</h2>
        <div class="rt-confirm-body">
          <p>You have already claimed your map chest.</p>
          <p>
            Please confirm that you have returned all
            tradable items to:
          </p>
          <div class="rt-confirm-seller">
            <strong>{prompt.sellerName}</strong>
            <a
              href={`https://www.mousehuntgame.com/profile.php?snuid=${prompt.sellerSnUserId}`}
              target="_blank"
              rel="noopener noreferrer"
              class="rt-confirm-snuid"
            >
              SNUID: {prompt.sellerSnUserId}
            </a>
          </div>
          <p class="rt-confirm-warning">
            This confirmation is required before you can
            create or match new orders.
          </p>
        </div>
        <div class="rt-confirm-actions">
          <button class="btn-accent" onClick={handleConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
