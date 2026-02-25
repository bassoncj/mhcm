import { signal } from "@preact/signals";
import type { OnboardingTask } from "@mhcm/shared";

/** Whether onboarding is complete. null = not yet known (loading). */
export const onboardingComplete = signal<boolean | null>(null);

/** Incomplete onboarding tasks (enabled steps only). */
export const onboardingTasks = signal<OnboardingTask[]>([]);
