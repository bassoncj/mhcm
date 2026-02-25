interface ConfirmModalProps {
  title: string;
  children: any;
  confirmLabel?: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  children,
  confirmLabel = "Confirm",
  confirmClass = "",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div class="modal-overlay" onClick={onCancel}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">{title}</div>
        <div class="modal-body">{children}</div>
        <div class="modal-footer">
          <button type="button" class="modal-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            class={`modal-btn confirm ${confirmClass}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
