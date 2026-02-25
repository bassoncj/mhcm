// Auto-generated from packages/server/seed/faq.md - do not edit directly
// Run: node scripts/generate-faq.mjs

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQGroup {
  title: string;
  slug: string;
  description?: string;
  items: FAQItem[];
}

export interface FAQCategory {
  title: string;
  slug: string;
  description?: string;
  items?: FAQItem[];
  groups?: FAQGroup[];
}

export const faqData: FAQCategory[] = [
  {
    "title": "Getting Started",
    "slug": "getting-started",
    "items": [
      {
        "question": "What is the Community Marketplace?",
        "answer": "The Community Marketplace is a platform that facilitates peer-to-peer trading between MouseHunt players. It supports multiple types of trades – map slots, sniping services, items, and full maps – all using Super Brie+ (SB) as currency. The marketplace runs as a browser extension that connects directly to the game."
      },
      {
        "question": "How do I sign up?",
        "answer": "Click 'Sign in with Discord' to create an account. You must be a member of the [MouseHunt Community](https://discord.gg/Ya9zEdk) Discord server to use the marketplace."
      },
      {
        "question": "How does account linking work?",
        "answer": "After signing in with Discord, the extension detects your MouseHunt Hunter ID from the game page and displays it in a confirmation dialog. Click 'Link Account' to permanently connect your MH account to your marketplace account. Each MouseHunt account can only be linked to one marketplace account."
      },
      {
        "question": "Is this extension allowed by HitGrab?",
        "answer": "There is no official endorsement, but the extension has been carefully designed to comply with HitGrab's rules on scripts and software. It does not refresh the page automatically, sound the horn, scrape or download content from the game, exploit any game flaws, or create automatic messages. It also actively pauses your orders after 60 minutes of inactivity – similar to MouseHunt's own idle rules – to avoid making it appear that you're playing when you're not. All trades are carried out using the game's built-in systems for invites and transfers."
      },
      {
        "question": "Can I unlink my MouseHunt account?",
        "answer": "No, the link between your Discord and MouseHunt accounts is permanent. This prevents users who violate marketplace rules from creating new accounts to evade restrictions."
      }
    ]
  },
  {
    "title": "General",
    "slug": "general",
    "description": "Common questions about features that work across all markets.",
    "groups": [
      {
        "title": "Favorites & Notifications",
        "slug": "favorites-and-notifications",
        "description": "Quick access and alerts for the things you trade most.",
        "items": [
          {
            "question": "How do I favorite a map type or mouse?",
            "answer": "Click the star icon next to any map type or mouse in the selector dropdown. Favorited items appear in a dedicated section at the top of the dropdown for quick access. Click the filled star to remove from favorites."
          },
          {
            "question": "How do I get notified of new listings?",
            "answer": "Click the bell icon next to a map type or mouse to subscribe. When someone creates a new sell order for that item, you'll receive a browser notification. This is useful for rare or hard-to-find listings."
          },
          {
            "question": "Where do I manage my notification settings?",
            "answer": "Open the menu and select 'Notifications'. Here you can toggle browser notifications for various events (AFK warnings, transaction updates, new listings) and see all your subscriptions with the option to unsubscribe."
          },
          {
            "question": "When should I use favorites vs notifications?",
            "answer": "Favorites are for quick access – things you trade frequently appear at the top of the dropdown. Notifications are for alerts – you get pinged when new sell orders appear. Use favorites for convenience, notifications for time-sensitive opportunities."
          }
        ]
      },
      {
        "title": "Transactions & Safety",
        "slug": "transactions-and-safety",
        "description": "How trades work and what protects your SB.",
        "items": [
          {
            "question": "How do transactions work in general?",
            "answer": "When a buy order matches a sell order, the extension handles the trade for you. The exact steps vary by market, but every transaction follows the same principle: each step must succeed before moving to the next, and nothing is transferred until all validations pass."
          },
          {
            "question": "What if a transaction fails?",
            "answer": "Failed transactions don't result in any loss. No SB is transferred until all steps complete successfully. If something goes wrong at any point, the transaction cancels and your order returns to the queue where it can match again."
          },
          {
            "question": "Is my SB safe?",
            "answer": "Yes. The marketplace never holds your SB – it only facilitates direct transfers between players through the game's built-in trading system. If a transaction fails for any reason, no SB changes hands."
          }
        ]
      },
      {
        "title": "AFK & Availability",
        "slug": "afk-and-availability",
        "description": "How the marketplace handles inactive players.",
        "items": [
          {
            "question": "Why am I marked as AFK?",
            "answer": "The marketplace pauses your orders after 60 minutes of no interaction with the MouseHunt tab. This prevents matching against players who have left their browser open but aren't actively playing, which would cause transactions to time out and slow things down for everyone."
          },
          {
            "question": "How do I become active again?",
            "answer": "Simply click or type anywhere on the MouseHunt game page. The extension reports your activity immediately and your orders can match again."
          },
          {
            "question": "Do I get a warning before going AFK?",
            "answer": "Yes, you'll receive a notification 5 minutes before the AFK timeout. The connection status in the panel also changes to 'AFK warning' so you can see it at a glance."
          }
        ]
      },
      {
        "title": "Technical",
        "slug": "technical",
        "description": "Browser extension details and troubleshooting.",
        "items": [
          {
            "question": "Why does the extension need these permissions?",
            "answer": "The extension needs access to mousehuntgame.com to read your game state (Hunter ID, active maps, SB balance) and perform actions (send invites, accept invites, transfer SB). It needs storage for your session and notifications for transaction alerts."
          },
          {
            "question": "The extension shows 'Disconnected' – what do I do?",
            "answer": "This means the connection to the marketplace server was lost. Try refreshing the MouseHunt page. If the issue persists, the server may be down for maintenance – check the [Community Marketplace](https://discordapp.com/channels/275500976662773761/1029053362483773480) channel on Discord for announcements."
          },
          {
            "question": "Can I use the marketplace on multiple devices?",
            "answer": "Yes, but you can only be signed in on one device at a time. Signing in on a new device will disconnect the previous session."
          },
          {
            "question": "What happens if I close my browser during a transaction?",
            "answer": "The transaction will fail after a timeout period. Your order returns to the queue and can match again when you reconnect. No SB is lost."
          }
        ]
      }
    ]
  },
  {
    "title": "Slots",
    "slug": "slots",
    "description": "Buy and sell treasure map slots using Super Brie+ as currency.",
    "groups": [
      {
        "title": "Getting Started",
        "slug": "getting-started",
        "description": "A quick overview of how slot trading works.",
        "items": [
          {
            "question": "What is slot trading?",
            "answer": "Slot trading lets you buy and sell open spots on treasure maps. Sellers list available slots on maps they're completing (down to the last mouse), and buyers purchase those slots to join the map and collect rewards."
          },
          {
            "question": "How does the buy/sell flow work?",
            "answer": "Sellers create a listing when their map is nearly complete. Buyers browse available map types and place orders at their desired price. When a buy and sell order match, the extension handles the entire process – validating the map, sending and accepting invites, and transferring SB."
          }
        ]
      },
      {
        "title": "Maps & Tiers",
        "slug": "maps-and-tiers",
        "description": "Understanding map types and mouse tier ratings.",
        "items": [
          {
            "question": "Why can't I see a specific map type?",
            "answer": "Map types are managed by marketplace moderators. A map type may be disabled if there's low demand, pricing issues, or other concerns. If you'd like to request a map type be enabled, ask in the [Community Marketplace](https://discordapp.com/channels/275500976662773761/1029053362483773480) channel on Discord."
          },
          {
            "question": "How are mouse tiers determined?",
            "answer": "Moderators assign tier ratings (S, A, B) to mice based on their attraction and catch rates as the last mouse on a map. S-tier mice have a possible 100% attraction and catch rate. A-tier mice have 100% attraction but imperfect catch rate. B-tier covers everything else. These ratings help buyers know what to expect from a map."
          },
          {
            "question": "Who manages map types and tiers?",
            "answer": "Marketplace moderators handle all map type and tier configuration. If you believe a tier rating is incorrect or a map type should be enabled or disabled, let us know in the [Community Marketplace](https://discordapp.com/channels/275500976662773761/1029053362483773480) channel on Discord."
          }
        ]
      },
      {
        "title": "Buying Slots",
        "slug": "buying-slots",
        "description": "How to purchase map slots.",
        "items": [
          {
            "question": "How do I buy a map slot?",
            "answer": "Select a map type from the Home screen to view the order book. Click 'Buy', set your price (SB per slot), quantity, and select which last mouse tier(s) you'll accept (S, A, B). You must have enough SB to place the order."
          },
          {
            "question": "What are the tier ratings when buying?",
            "answer": "When placing a buy order, you choose which last mouse tiers you're willing to accept. S-tier means the best possible catch rate on the last mouse. A-tier is slightly lower. B-tier covers everything else. You can select any combination, and you can place multiple buy orders for the same map type at different prices depending on the tier."
          },
          {
            "question": "What happens when my buy order matches?",
            "answer": "The extension handles the transaction for you. It validates you can join the map, creates an invite from the seller, accepts the invite on your behalf, and transfers SB to the seller. You'll see a progress indicator showing each step. If any step fails, the transaction cancels and your order returns to the queue."
          },
          {
            "question": "Can I cancel a buy order?",
            "answer": "Yes, you can cancel any open or partially filled order from the Orders tab. Cancelled orders are removed immediately."
          }
        ]
      },
      {
        "title": "Selling Slots",
        "slug": "selling-slots",
        "description": "How to list your map slots for sale.",
        "items": [
          {
            "question": "How do I sell a map slot?",
            "answer": "You must have an active map that's down to the last mouse (LM) – or last 2 mice (L2M) for certain map types. The extension detects your map for you. Select the map type, click 'Sell', set your price and quantity. The tier is determined based on the remaining mouse."
          },
          {
            "question": "Why can't I list my map for sale?",
            "answer": "You can only sell when your map has 1 mouse remaining (or 1–2 for maps that allow L2M). If you have more mice left, you need to complete more catches first."
          },
          {
            "question": "How many slots can I sell?",
            "answer": "The number of available slots is calculated as: map max hunters minus active hunters minus pending invites minus already listed slots. The extension shows this when creating a sell order."
          },
          {
            "question": "What happens when my sell order matches?",
            "answer": "The extension validates your map still has available slots, then sends an invite to the buyer. Once they accept and transfer SB, the transaction completes. If validation fails (for example, the map filled up), your order is cancelled or reduced."
          }
        ]
      },
      {
        "title": "Orders & Pricing",
        "slug": "orders-and-pricing",
        "description": "How the order book and pricing work.",
        "items": [
          {
            "question": "How does order matching work?",
            "answer": "Orders match when a buyer's price meets or exceeds a seller's price for the same map type and compatible tier. The transaction executes at the seller's asking price. Orders are matched in price-time priority – best prices first, then oldest orders when prices tie."
          },
          {
            "question": "Why did my order match at a different price than I set?",
            "answer": "Buy orders always execute at the seller's price, not your bid. If you bid 100 SB but the cheapest seller is asking 80 SB, you pay 80 SB. You'll never pay more than your bid."
          },
          {
            "question": "What do the order book numbers mean?",
            "answer": "The sell side shows available slots at each price, sorted cheapest first. The buy side shows demand at each price, sorted highest first. The spread between the lowest sell and highest buy price indicates how active the market is."
          }
        ]
      },
      {
        "title": "Queue & Matching",
        "slug": "queue-and-matching",
        "description": "How multi-slot orders and queue priority work.",
        "items": [
          {
            "question": "How does the order queue work?",
            "answer": "Orders are matched using price-time priority. For buyers, the highest price gets matched first; for sellers, the lowest price. When prices are equal, the oldest order gets priority. Each transaction processes one slot at a time to ensure fairness."
          },
          {
            "question": "I placed a buy order for multiple slots. How does that work?",
            "answer": "Multi-slot buy orders are processed one slot at a time. When your order matches, you buy 1 slot and join that map. While on a map, you're marked as 'busy' and won't match again. When you leave the map, your order goes to the back of the queue at your price level – behind other buyers at the same price who were waiting. This ensures fair access for all buyers."
          },
          {
            "question": "How does seller queue priority work?",
            "answer": "Sell orders stay at the front of the queue. If you list 3 slots for your map, they'll match consecutively with available buyers until your map is full. This prioritizes filling maps quickly so buyers cycle out of their 'busy' state faster, keeping the marketplace moving."
          },
          {
            "question": "Why does the queue treat buyers and sellers differently?",
            "answer": "Buyers compete for limited map slots, so fair queuing prevents large orders from monopolizing supply. Sellers want their maps to fill quickly so everyone can move on. By keeping sell orders at the front while cycling buy orders to the back, maps complete faster and the marketplace stays liquid."
          }
        ]
      },
      {
        "title": "Safety & Risk",
        "slug": "safety-and-risk",
        "description": "Understanding the risk check and what happens if things go wrong.",
        "items": [
          {
            "question": "What is the risk check prompt?",
            "answer": "Before certain transactions begin, you may see a risk warning showing which goals on the seller's map are close to completion (\"at risk\"). This appears when catching or finding one more goal could complete the map before your slot is fully processed. You can accept the match and proceed, or reject it to be matched with a different seller instead."
          },
          {
            "question": "What happens if a map completes while I'm waiting for a slot?",
            "answer": "If the map completes before your invite is accepted, the transaction fails and your order returns to the queue. No SB is transferred for failed transactions – you only pay for slots that are successfully filled."
          },
          {
            "question": "What happens if I accidentally complete a map with unfilled slots?",
            "answer": "If you are the seller and your map completes while slots are still being filled, you are responsible for the SB owed on unfilled slots. The extension cannot reverse a completed map. Always monitor your map's remaining goals when you have active sell orders."
          },
          {
            "question": "Can I reject a match if I see risk?",
            "answer": "Yes. When the risk check prompt appears, you can reject the match. This blocks that specific seller-buyer pairing, and your order will be matched with a different seller if one is available. You can also let the prompt time out, which has the same effect as rejecting."
          }
        ]
      }
    ]
  },
  {
    "title": "Sniping",
    "slug": "sniping",
    "description": "Hire snipers to catch mice on your maps, or offer your sniping services to other hunters.",
    "groups": [
      {
        "title": "Getting Started",
        "slug": "getting-started",
        "description": "What sniping is and how the marketplace connects snipers with map owners.",
        "items": [
          {
            "question": "What is sniping?",
            "answer": "In MouseHunt, 'sniping' means joining someone else's map temporarily to catch a specific mouse, then leaving once the catch is made. It's a way for skilled hunters to help map owners complete difficult maps. The marketplace streamlines the process of finding, hiring, and paying snipers."
          },
          {
            "question": "What are the two roles?",
            "answer": "There are two sides to every sniping trade. The **maptain** (map owner) is the buyer – they're looking to hire someone to catch a mouse on their map. The **sniper** is the seller – they're offering their services to catch mice for a fee."
          },
          {
            "question": "How does the marketplace connect snipers and maptains?",
            "answer": "Maptains create buy orders for specific mice they need caught, and snipers create sell orders offering their services. When a buy and sell order match on the same mouse, the marketplace handles the entire flow – inviting the sniper to the map, detecting the catch, transferring payment, and having the sniper leave."
          }
        ]
      },
      {
        "title": "Hiring a Sniper",
        "slug": "hiring-a-sniper",
        "description": "How to find and hire a sniper for your map.",
        "items": [
          {
            "question": "How do I hire a sniper?",
            "answer": "Navigate to the Sniping market and select the mouse you need caught (or a mouse group). Set your price and create a buy order. When a sniper's sell order matches, the transaction begins – the sniper is invited to your map, catches the mouse, and you pay the agreed price."
          },
          {
            "question": "Can I hire a sniper for multiple mice at once?",
            "answer": "Yes, you can place buy orders for individual mice or for mouse groups. If you need several mice caught on the same map, you can create separate orders for each, or use a group that covers them all."
          },
          {
            "question": "What happens during the transaction?",
            "answer": "Once matched, the sniper receives an invite to your map. After they join, the extension monitors for the catch. When the mouse is caught, SB is transferred to the sniper, and they leave the map. You'll see progress updates for each step."
          },
          {
            "question": "What if the sniper can't catch the mouse?",
            "answer": "If the sniper leaves your map without making the catch, or if the transaction times out, no SB is transferred. Your order returns to the queue and can match with another sniper."
          }
        ]
      },
      {
        "title": "Offering Sniping Services",
        "slug": "offering-sniping-services",
        "description": "How to sell your sniping skills.",
        "items": [
          {
            "question": "How do I offer sniping services?",
            "answer": "Navigate to the Sniping market and create a sell order for the mice you can catch. Set your price per catch. When a maptain's buy order matches, you'll receive a map invite, catch the mouse, get paid, and leave – all handled by the extension."
          },
          {
            "question": "How are sell orders matched?",
            "answer": "Sell orders match against buy orders for the same mouse or mouse group. Like other markets, matching uses price-time priority – lowest price first, oldest order when prices tie. The transaction executes at your asking price."
          },
          {
            "question": "Any tips for pricing?",
            "answer": "The marketplace shows 7-day and 30-day average prices for each mouse to help you set competitive rates. Rarer or harder-to-catch mice typically command higher prices."
          }
        ]
      },
      {
        "title": "Mouse Groups",
        "slug": "mouse-groups",
        "description": "How mice are bundled into groups for easier trading.",
        "items": [
          {
            "question": "What are mouse groups?",
            "answer": "Mouse groups bundle related mice together – for example, all mice on a particular map type or all mice in a difficulty tier. When you place an order for a group, it can match against any mouse in that group."
          },
          {
            "question": "Why use groups instead of individual mice?",
            "answer": "Groups make it easier to trade when you don't care about a specific mouse. As a maptain, you might need any of several mice caught – a group order covers them all. As a sniper, listing for a group means more potential matches."
          },
          {
            "question": "How does pricing work with groups?",
            "answer": "Each mouse within a group can have a different average price. When you create a group order, the marketplace shows suggested prices based on recent averages to help you set a fair rate."
          }
        ]
      },
      {
        "title": "How Sniping Transactions Work",
        "slug": "how-sniping-transactions-work",
        "description": "The step-by-step flow of a sniping trade.",
        "items": [
          {
            "question": "What are the transaction steps?",
            "answer": "A sniping transaction follows these steps: the sniper is invited to the maptain's map, the sniper joins, the extension monitors for the catch, the catch is detected, SB is transferred from the maptain to the sniper, and the sniper leaves the map."
          },
          {
            "question": "How are catches detected?",
            "answer": "The extension detects catches by monitoring the game – there's no need for either party to manually confirm anything. When the target mouse is caught on the map, the extension recognizes it and moves the transaction forward."
          },
          {
            "question": "What if multiple mice need to be caught?",
            "answer": "If a maptain needs multiple mice caught by the same sniper on the same map, these are bundled into a single transaction. The sniper stays on the map until all matched mice are caught (or the transaction times out), and payment covers all catches."
          },
          {
            "question": "What happens if the sniper leaves early?",
            "answer": "If the sniper leaves the map before completing the catch, the transaction fails and no SB is transferred. The maptain's order returns to the queue. If the sniper left after catching the mouse but before the payment step, the extension handles payment correctly regardless."
          }
        ]
      }
    ]
  },
  {
    "title": "Items",
    "slug": "items",
    "description": "Trade MouseHunt items with other hunters using Super Brie+ as currency.",
    "groups": [
      {
        "title": "Getting Started",
        "slug": "getting-started",
        "description": "A quick overview of how item trading works.",
        "items": [
          {
            "question": "What is item trading?",
            "answer": "The item marketplace lets you buy and sell MouseHunt items directly with other players. Unlike slot trading (which is about map access) or sniping (which is a service), item trading is a straightforward exchange of goods for SB."
          },
          {
            "question": "Which items can I trade?",
            "answer": "The available items are managed by marketplace moderators. Common tradeable items include crafting materials, cheese, charms, and other in-game resources. If you'd like to see a specific item added, ask in the [Community Marketplace](https://discordapp.com/channels/275500976662773761/1029053362483773480) channel on Discord."
          },
          {
            "question": "How does item trading differ from other markets?",
            "answer": "Item trades can fill partially – if you list 10 of an item and a buyer only wants 5, the trade fills for 5 and your remaining 5 stay listed. Orders also execute at the seller's asking price, just like other markets."
          }
        ]
      },
      {
        "title": "Buying Items",
        "slug": "buying-items",
        "description": "How to purchase items from other hunters.",
        "items": [
          {
            "question": "How do I buy an item?",
            "answer": "Navigate to the Items market, select the item you want, and create a buy order. Set your price per unit and the quantity you want. When a matching sell order is found, the transaction begins."
          },
          {
            "question": "Can orders fill partially?",
            "answer": "Yes. If you place a buy order for 10 items but a seller only has 3, you'll buy those 3 and your remaining order for 7 stays active. This continues until your full order is filled or you cancel."
          },
          {
            "question": "What price do I pay?",
            "answer": "You always pay the seller's asking price, not your bid. If you bid 50 SB but the cheapest seller asks 40 SB, you pay 40 SB per item."
          }
        ]
      },
      {
        "title": "Selling Items",
        "slug": "selling-items",
        "description": "How to list your items for sale.",
        "items": [
          {
            "question": "How do I sell an item?",
            "answer": "Navigate to the Items market, select the item, and create a sell order. Set your price per unit and the quantity you want to sell. The extension verifies you have the items before listing."
          },
          {
            "question": "Can my sell order fill partially?",
            "answer": "Yes. If you list 10 items and a buyer only wants 5, those 5 sell and the remaining 5 stay listed at your price."
          },
          {
            "question": "How is the price determined?",
            "answer": "Transactions always execute at your asking price. A buyer's bid must meet or exceed your price for a match to occur, but they'll pay exactly what you asked."
          }
        ]
      },
      {
        "title": "How Item Transactions Work",
        "slug": "how-item-transactions-work",
        "description": "The step-by-step flow of an item trade.",
        "items": [
          {
            "question": "What are the transaction steps?",
            "answer": "An item transaction goes through these steps: first, the seller's inventory is validated to ensure they still have the items. Then the seller transfers the items to the buyer. Finally, the buyer transfers SB to the seller. Each step must succeed before the next begins."
          },
          {
            "question": "What happens if a step fails?",
            "answer": "If any step fails – for example, the seller no longer has the items or either player goes offline – the transaction cancels. Any items or SB already transferred in a failed step are handled by the game's built-in systems. Your order returns to the queue."
          },
          {
            "question": "How are quantities determined?",
            "answer": "The fill quantity is the smaller of what the seller has available and what the buyer wants. If a seller lists 20 items and a buyer wants 8, the trade fills for 8."
          }
        ]
      },
      {
        "title": "Pricing",
        "slug": "pricing",
        "description": "How fractional item prices work.",
        "items": [
          {
            "question": "Can I set fractional prices?",
            "answer": "Yes. Item prices can be set in 0.1 SB increments (e.g., 1.3 SB, 0.5 SB). Since SB transfers must be whole numbers, your price and quantity must produce a whole-number total. The order form will guide you to valid quantities."
          },
          {
            "question": "What is the minimum fill quantity?",
            "answer": "It depends on price. Whole-number prices (like 2 SB) can fill 1 at a time. Prices ending in .5 fill in multiples of 2. Prices ending in .2, .4, .6, or .8 fill in multiples of 5. Prices ending in .1, .3, .7, or .9 fill in multiples of 10."
          },
          {
            "question": "Can I change a fractional-price order?",
            "answer": "Yes, but if the remaining quantity would be incompatible with the new price, the change will be blocked."
          }
        ]
      }
    ]
  },
  {
    "title": "Maps",
    "slug": "maps",
    "description": "Buy and sell treasure maps in three different modes.",
    "groups": [
      {
        "title": "Getting Started",
        "slug": "getting-started",
        "description": "An overview of map trading and the different modes available.",
        "items": [
          {
            "question": "What is map trading?",
            "answer": "The map marketplace lets you buy and sell treasure maps themselves – not slots on maps, but the actual maps. There are three different modes depending on what state the map is in, each with its own rules and workflow."
          },
          {
            "question": "What are the three modes?",
            "answer": "The three modes are **Unopened**, **Completed**, and **Fresh**. Each one represents a different state a map can be in, and determines what the buyer receives and what the seller needs to have."
          }
        ]
      },
      {
        "title": "Unopened Maps",
        "slug": "unopened-maps",
        "description": "Trading sealed map scrolls.",
        "items": [
          {
            "question": "What is an unopened map?",
            "answer": "An unopened map is a scroll that hasn't been used yet. When you buy one, you receive the sealed scroll and can open it yourself whenever you're ready. Since scrolls always produce common-quality maps when opened, only common map types are available in this mode."
          },
          {
            "question": "Why would I buy an unopened scroll?",
            "answer": "Buying a scroll lets you start a map fresh on your own terms – you choose when to open it, who to invite, and how to run it. It's also useful if you want to stockpile maps for later."
          }
        ]
      },
      {
        "title": "Completed Maps",
        "slug": "completed-maps",
        "description": "Trading maps that are down to the last mouse.",
        "items": [
          {
            "question": "What is a completed map?",
            "answer": "A completed map has only the last mouse remaining. When you buy one, you join the map and catch (or wait for) the final mouse to collect your rewards. Once that last mouse is caught, the map closes – no new hunters can join and the rarity can't be upgraded after that point. Both common and rare quality maps are available in this mode."
          },
          {
            "question": "Why would I buy a completed map?",
            "answer": "It's the fastest way to collect map rewards. You join a map that's almost done, the last mouse gets caught, and you receive the loot. It's ideal when you want rewards without doing the full map yourself."
          }
        ]
      },
      {
        "title": "Fresh Maps",
        "slug": "fresh-maps",
        "description": "Trading newly created, empty maps.",
        "items": [
          {
            "question": "What is a fresh map?",
            "answer": "A fresh map has been opened from a scroll but has no progress – no mice caught, no hunters invited. When you buy one, you get a clean slate to complete however you like."
          },
          {
            "question": "Why would I buy a fresh map?",
            "answer": "Fresh maps are useful when you want a specific map type that you don't have a scroll for, or when you want to skip the step of opening a scroll yourself. You get full control over how the map is run from the start."
          }
        ]
      },
      {
        "title": "Buying Maps",
        "slug": "buying-maps",
        "description": "How to purchase maps in each mode.",
        "items": [
          {
            "question": "How do I buy a map?",
            "answer": "Navigate to the Maps market, select the mode (Unopened, Completed, or Fresh), and choose the map type. Set your price and create a buy order. When a matching sell order is found, the transaction begins."
          },
          {
            "question": "Does the mode affect which maps are available?",
            "answer": "Yes. In Unopened mode, only common-quality map types appear since scrolls always produce common maps. In Completed mode, both common and rare map types are available since maps can be upgraded during play. In Fresh mode, the available types depend on what sellers have listed."
          },
          {
            "question": "What price do I pay?",
            "answer": "Like other markets, you always pay the seller's asking price. Map prices vary significantly by type, quality, and mode."
          }
        ]
      },
      {
        "title": "Selling Maps",
        "slug": "selling-maps",
        "description": "How to list your maps for sale.",
        "items": [
          {
            "question": "How do I sell a map?",
            "answer": "Navigate to the Maps market, select the mode that matches your map's state, choose the map type, set your price, and create a sell order. The extension validates that you have the correct type of map before listing."
          },
          {
            "question": "What are the requirements for each mode?",
            "answer": "For Unopened mode, you need a sealed map scroll in your inventory. For Completed mode, you need a map that's down to the last mouse. For Fresh mode, you need a newly opened map with no progress."
          },
          {
            "question": "Can I sell the same map in different modes?",
            "answer": "No, each map can only be listed in the mode that matches its current state. A completed map can't be listed as fresh, and an unopened scroll can't be listed as completed."
          }
        ]
      },
      {
        "title": "How Map Transactions Work",
        "slug": "how-map-transactions-work",
        "description": "The step-by-step flow of a map trade.",
        "items": [
          {
            "question": "What are the transaction steps?",
            "answer": "Map transactions vary by mode, but all follow the same general pattern: validation (confirming both parties have what's needed), the map transfer (seller sends the map to the buyer), and payment (buyer transfers SB to the seller)."
          },
          {
            "question": "How does validation differ by mode?",
            "answer": "In Unopened mode, the extension confirms the seller has the scroll. In Completed mode, it confirms the map is down to the last mouse. In Fresh mode, it confirms the map is newly opened with no progress. If validation fails, the transaction cancels and your order returns to the queue."
          },
          {
            "question": "What happens if a transaction fails?",
            "answer": "No SB or maps are lost on failure. If any step fails, the transaction cancels and both parties' orders return to the queue. The marketplace never holds your items – it only facilitates direct transfers through the game."
          }
        ]
      },
      {
        "title": "Safety & Risk",
        "slug": "safety-and-risk",
        "description": "Understanding the LM condition and risk checks for map trading.",
        "items": [
          {
            "question": "What is the LM/LL condition for completed maps?",
            "answer": "To sell a map in completed mode, every goal on the map must be down to its last target – last mouse (LM) for mouse maps, or last loot (LL) for item/scavenger hunt maps. This ensures that buyers are joining a map that's genuinely almost finished, not one with significant progress still needed."
          },
          {
            "question": "Does the risk check apply to map trading?",
            "answer": "Yes. In completed mode, the same risk check that applies to slot trading also applies to map purchases. If the map has goals that are at risk of completing before the buyer joins, a warning is shown. The buyer can accept or reject the match."
          },
          {
            "question": "What happens if a completed map finishes before the buyer joins?",
            "answer": "If the map completes before the ownership transfer happens, the transaction fails and both parties' orders return to the queue. No SB is transferred for failed transactions."
          }
        ]
      }
    ]
  }
];
