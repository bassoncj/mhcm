// Auto-generated from packages/server/seed/onboarding.md – do not edit directly
// Run: node scripts/generate-onboarding.mjs

export interface OnboardingStepMeta {
  id: string;
  version: number;
  type: "confirm" | "acknowledge";
  title: string;
  icon: string | null;
}

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  {
    "id": "welcome",
    "version": 6,
    "type": "acknowledge",
    "title": "Welcome",
    "icon": "wand"
  },
  {
    "id": "hitgrab-compliance",
    "version": 4,
    "type": "acknowledge",
    "title": "Scripting & Compliance",
    "icon": "shield"
  },
  {
    "id": "trading-info",
    "version": 2,
    "type": "acknowledge",
    "title": "Trading Info",
    "icon": "bulb"
  },
  {
    "id": "privacy",
    "version": 3,
    "type": "acknowledge",
    "title": "Privacy",
    "icon": "lock"
  },
  {
    "id": "risk-acknowledgement",
    "version": 3,
    "type": "confirm",
    "title": "Map Completion Risk",
    "icon": "alert"
  }
];
