// Auto-generated from packages/server/seed/onboarding.md – do not edit directly
// Run: node scripts/generate-onboarding.mjs

export interface OnboardingStep {
  id: string;
  version: number;
  type: "confirm" | "acknowledge";
  title: string;
  icon: string | null;
  htmlContent: string;
}

export const onboardingSteps: OnboardingStep[] = [
  {
    "id": "welcome",
    "version": 6,
    "type": "acknowledge",
    "title": "Welcome",
    "icon": "wand",
    "htmlContent": "<p>\nThe MouseHunt Community Marketplace lets you trade map slots, sniping services, items, and maps with other MouseHunt players.\n</p>\n<p>\nYou place buy or sell orders, get matched with a partner, and the extension handles scroll opening, invites, or SB transfers through your game tab.\n</p>\n<p>\nThe Community Marketplace is free to use, opensource, and relies on optional generosity toward covering running and coffee costs.\n</p>\n<div class=\"onboarding-warning\">\n<strong>Important:</strong> The Community Marketplace is in easrly access and we are working on constant improvements based on your feedback and suggestions.\n</div>"
  },
  {
    "id": "hitgrab-compliance",
    "version": 4,
    "type": "acknowledge",
    "title": "Scripting & Compliance",
    "icon": "shield",
    "htmlContent": "<p>\nThe Community Marketplace is a <strong>community-built tool</strong> not affiliated with or endorsed by HitGrab Inc.\n</p>\n<p>\nThe extension has been carefully designed to comply with HitGrab's rules on scripts and software.\n</p>\n<ul>\n<li>It <strong>does not</strong> refresh the page automatically, sound the horn, scrape or download content from the game, exploit any game flaws, or create in-game messages.</li>\n<li>It <strong>does</strong> actively pause order matching after 60 minutes of inactivity – similar to MouseHunt's own idle rules – to avoid making it appear that you're playing when you're not.</li>\n<li>All trades are carried out using the game's built-in systems for invites and transfers.</li>\n</ul>\n<p>\nThe goal is convenience and safety, not unfair advantage.\n</p>"
  },
  {
    "id": "trading-info",
    "version": 2,
    "type": "acknowledge",
    "title": "Trading Info",
    "icon": "bulb",
    "htmlContent": "<ul>\n<li><strong>SB committments:</strong> when you place a buy order we check that you have the required SB qty to cover the order and all other open buy orders you have on the market.</li>\n<li><strong>AFK handling:</strong> if you are inactive for 60+ min you will be set to AFK, and all of your orders (buy and sell) will stop processing until you return.</li>\n<li><strong>Sniping:</strong> if the maptain is AFK when you complete sniping tasks, you can leave the map and the extension will transfer SB from the maptain when they return.</li>\n<li><strong>Bad actors:</strong> players who attempt to abuse the market system or harass other hunters will have their MH account blocked from the market.</li>\n</ul>"
  },
  {
    "id": "privacy",
    "version": 3,
    "type": "acknowledge",
    "title": "Privacy",
    "icon": "lock",
    "htmlContent": "<p>\n<strong>What we collect:</strong> Your MH user ID, Discord ID, and which map(s) you're on.\n</p>\n<p>\n<strong>What we create and store:</strong> Your Community Marketplace orders, order activity, and order history.\n</p>\n<p>\n<strong>What we don't touch:</strong> Your password, hunting activity, horn sounds, or game progress. No third-party sharing. No advertising.\n</p>\n<p>\nWe use Discord OAuth for authentication – we only access your user ID, username, and server membership to verify that you are part of the MH Community Discord.\n</p>"
  },
  {
    "id": "risk-acknowledgement",
    "version": 3,
    "type": "confirm",
    "title": "Map Completion Risk",
    "icon": "alert",
    "htmlContent": "<p>\nIf you match with a map and there is risk that you could close the map early, you'll see a risk warning showing which goals you may be at risk of completing. You can <strong>accept</strong> the risk or <strong>reject</strong> the match.\n</p>\n<p>\nIf you do close a map early, the you owe the seller fair value for the slots they weren't able to fill!\n</p>\n<div class=\"onboarding-warning\">\n<strong>Important:</strong> Accidental map completion is your responsibility. The marketplace cannot reverse completed maps or refund SB.\n</div>"
  }
];
