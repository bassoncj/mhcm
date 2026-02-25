import type { ComponentChildren } from "preact";

interface StepperInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  icon?: ComponentChildren;
  /** Render label + stepper + suffix on a single horizontal row. */
  inline?: boolean;
  /** Content rendered after the stepper (e.g. a checkbox). Only used with inline. */
  suffix?: ComponentChildren;
  /** Allow one decimal place (e.g. 1.3). Parse with parseFloat, round to 1dp. */
  decimal?: boolean;
}

export function StepperInput({
  label,
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  disabled = false,
  icon,
  inline = false,
  suffix,
  decimal = false,
}: StepperInputProps) {
  const canDecrement = !disabled && value - step >= min;
  const canIncrement = !disabled && (max == null || value + step <= max);

  const handleInput = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value;
    if (raw === "") {
      onChange(min);
      return;
    }
    let num = decimal
      ? Math.round(parseFloat(raw) * 10) / 10
      : parseInt(raw, 10);
    if (isNaN(num)) return;
    if (num < min) num = min;
    if (max != null && num > max) num = max;
    onChange(num);
  };

  return (
    <div class={`stepper-field${inline ? " stepper-field-inline" : ""}`}>
      <span class="stepper-label">
        {icon && <span class="stepper-icon">{icon}</span>}
        {label}
      </span>
      <div class="stepper">
        <button
          type="button"
          class="stepper-btn"
          disabled={!canDecrement}
          onClick={() => {
            const next = decimal
              ? Math.round((value - step) * 10) / 10
              : value - step;
            onChange(Math.max(min, next));
          }}
          aria-label={`Decrease ${label}`}
        >
          &minus;
        </button>
        <input
          type={decimal ? "text" : "number"}
          inputMode={decimal ? "decimal" : "numeric"}
          class="stepper-value"
          value={value}
          onInput={handleInput}
          min={min}
          max={max}
          step="any"
          disabled={disabled}
        />
        <button
          type="button"
          class="stepper-btn"
          disabled={!canIncrement}
          onClick={() => {
            const next = decimal
              ? Math.round((value + step) * 10) / 10
              : value + step;
            onChange(max != null ? Math.min(max, next) : next);
          }}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
      {inline && <div class="stepper-suffix">{suffix}</div>}
    </div>
  );
}
