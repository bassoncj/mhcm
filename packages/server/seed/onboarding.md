# Onboarding Steps

Source file for the onboarding wizard. Parsed by `scripts/generate-onboarding.mjs`.

Each step is defined by an HTML comment block with metadata (id, type, title, icon),
followed by markdown content. Steps are separated by `---`.

---

<!--
id: welcome
type: acknowledge
title: Welcome
icon: wand
-->

# Welcome

The MouseHunt Community Marketplace lets you trade map slots, sniping services, items, and maps with other MouseHunt players.

You place buy or sell orders, get matched with a partner, and the extension handles scroll opening, invites, or SB transfers through your game tab.

The Community Marketplace is free to use, opensource, and relies on optional generosity toward covering running and coffee costs.

<div class="onboarding-warning">
<strong>Important:</strong> The Community Marketplace is in easrly access and we are working on constant improvements based on your feedback and suggestions.
</div>

---

<!--
id: hitgrab-compliance
type: acknowledge
title: Scripting & Compliance
icon: shield
-->

# Scripting & Compliance

The Community Marketplace is a **community-built tool** not affiliated with or endorsed by HitGrab Inc.

The extension has been carefully designed to comply with HitGrab's rules on scripts and software.

- It **does not** refresh the page automatically, sound the horn, scrape or download content from the game, exploit any game flaws, or create in-game messages.
- It **does** actively pause order matching after 60 minutes of inactivity – similar to MouseHunt's own idle rules – to avoid making it appear that you're playing when you're not.
- All trades are carried out using the game's built-in systems for invites and transfers.

The goal is convenience and safety, not unfair advantage.

---

<!--
id: trading-info
type: acknowledge
title: Trading Info
icon: bulb
-->

# Trading Info

- **SB committments:** when you place a buy order we check that you have the required SB qty to cover the order and all other open buy orders you have on the market.
- **AFK handling:** if you are inactive for 60+ min you will be set to AFK, and all of your orders (buy and sell) will stop processing until you return.
- **Sniping:** if the maptain is AFK when you complete sniping tasks, you can leave the map and the extension will transfer SB from the maptain when they return.
- **Bad actors:** players who attempt to abuse the market system or harass other hunters will have their MH account blocked from the market.

---

<!--
id: privacy
type: acknowledge
title: Privacy
icon: lock
-->

# Privacy

**What we collect:** Your MH user ID, Discord ID, and which map(s) you're on.

**What we create and store:** Your Community Marketplace orders, order activity, and order history.

**What we don't touch:** Your password, hunting activity, horn sounds, or game progress. No third-party sharing. No advertising.

We use Discord OAuth for authentication – we only access your user ID, username, and server membership to verify that you are part of the MH Community Discord.

---

<!--
id: risk-acknowledgement
type: confirm
title: Map Completion Risk
icon: alert
-->

# Map Completion Risk

If you match with a map and there is risk that you could close the map early, you'll see a risk warning showing which goals you may be at risk of completing. You can **accept** the risk or **reject** the match.

If you do close a map early, the you owe the seller fair value for the slots they weren't able to fill!

<div class="onboarding-warning">
<strong>Important:</strong> Accidental map completion is your responsibility. The marketplace cannot reverse completed maps or refund SB.
</div>
