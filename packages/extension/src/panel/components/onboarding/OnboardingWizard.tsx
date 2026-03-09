import { Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { onboardingSteps } from "../../data/onboarding-data.js";
import { onboardingComplete, onboardingTasks } from "../../signals/onboarding.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { DoodleBackground } from "./DoodleBackground.js";

// Step icon components – keyed by the `icon` field in onboarding metadata
function StepIconWand({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m15 4-1 1 4 4 1-1a2.83 2.83 0 1 0-4-4Z" />
      <path d="m14 5-9 9 4 4 9-9" />
      <path d="m5 14-2 2 4 4 2-2" />
      <line x1="9" y1="2" x2="9" y2="5" />
      <line x1="2" y1="9" x2="5" y2="9" />
      <line x1="18" y1="13" x2="21" y2="13" />
    </svg>
  );
}

function StepIconShield({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function StepIconCoins({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <line x1="7" y1="6" x2="7" y2="10" />
      <line x1="5" y1="8" x2="9" y2="8" />
    </svg>
  );
}

function StepIconLock({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function StepIconBulb({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

function StepIconAlert({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

const STEP_ICONS: Record<string, (props: { size?: number }) => preact.JSX.Element> = {
  wand: StepIconWand,
  shield: StepIconShield,
  coins: StepIconCoins,
  bulb: StepIconBulb,
  lock: StepIconLock,
  alert: StepIconAlert,
};

export function OnboardingWizard() {
  const tasks = onboardingTasks.value;

  const incompleteStepIds = new Set(
    tasks.filter((t) => t.completedAt === null).map((t) => t.stepId)
  );

  // Show all steps that have a task row (enabled steps), preserving authored order
  const visibleSteps = onboardingSteps.filter((s) =>
    tasks.some((t) => t.stepId === s.id)
  );

  // Find the first incomplete step index to auto-navigate to
  const firstIncompleteIdx = visibleSteps.findIndex((s) => incompleteStepIds.has(s.id));

  const [currentIdx, setCurrentIdx] = useState(Math.max(firstIncompleteIdx, 0));
  const [confirmed, setConfirmed] = useState(false);

  // Reset checkbox when navigating
  useEffect(() => {
    setConfirmed(false);
  }, [currentIdx]);

  if (visibleSteps.length === 0) {
    return null;
  }

  const step = visibleSteps[currentIdx];
  const task = tasks.find((t) => t.stepId === step.id && t.version === step.version);
  const isCompleted = task != null && task.completedAt !== null;
  const isFirst = currentIdx === 0;

  // Check if any incomplete steps exist after the current index
  const hasLaterIncomplete = visibleSteps
    .slice(currentIdx + 1)
    .some((s) => incompleteStepIds.has(s.id));
  const isFinalStep = !hasLaterIncomplete;

  // "Next" enabled if: step is already completed, or it's acknowledge type, or confirm type with checkbox
  const canProceed = isCompleted || step.type === "acknowledge" || confirmed;

  const handleNext = () => {
    // Complete the step if not already done
    if (!isCompleted && task) {
      wsSend({
        type: "complete_onboarding_step",
        payload: { stepId: step.id, version: task.version },
      });
      // Optimistically mark completed locally so the stepper updates immediately
      onboardingTasks.value = onboardingTasks.value.map((t) =>
        t.stepId === step.id && t.version === task.version
          ? { ...t, completedAt: new Date().toISOString() }
          : t
      );
    }

    if (!isFinalStep) {
      setCurrentIdx(currentIdx + 1);
    } else {
      // Final step – dismiss if all tasks are now complete (optimistically or actually)
      const allDone = onboardingTasks.value.every((t) => t.completedAt !== null);
      if (allDone) {
        onboardingComplete.value = true;
      }
      // Server will confirm via onboarding_status
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setCurrentIdx(currentIdx - 1);
    }
  };

  const StepIcon = step.icon ? STEP_ICONS[step.icon] : null;

  return (
    <div class="onboarding-wizard">
      <div class="onboarding-stepper">
        {visibleSteps.map((s, i) => {
          const done = !incompleteStepIds.has(s.id);
          const active = i === currentIdx;
          // Line is green if the step to its LEFT is completed
          const prevDone = i > 0 && !incompleteStepIds.has(visibleSteps[i - 1].id);
          return (
            <Fragment key={s.id}>
              {i > 0 && <div class={`stepper-line${prevDone ? " done" : ""}`} />}
              <button
                class={`stepper-step${active ? " active" : ""}${done && !active ? " done" : ""}`}
                onClick={() => setCurrentIdx(i)}
                title={s.title}
              >
                {done && !active ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  i + 1
                )}
              </button>
            </Fragment>
          );
        })}
      </div>

      <div class="onboarding-body">
        <DoodleBackground />
        <div class="onboarding-step-header">
          {StepIcon && <StepIcon size={28} />}
          <h1>{step.title}</h1>
        </div>

        <div class="onboarding-content" dangerouslySetInnerHTML={{ __html: step.htmlContent }} />
      </div>

      <div class="onboarding-footer">
        {step.type === "confirm" && !isCompleted && (
          <label class="onboarding-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed((e.target as HTMLInputElement).checked)}
            />
            I understand and accept
          </label>
        )}

        <div class="onboarding-nav">
          {!isFirst && (
            <button
              class="onboarding-back"
              onClick={handleBack}
            >
              Back
            </button>
          )}
          <button
            class="onboarding-next"
            onClick={handleNext}
            disabled={!canProceed}
          >
            {isFinalStep ? "Get Started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
