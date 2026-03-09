function extractIdentity(): void {
  const user = (window as any).user;
  if (!user) {
    // Game hasn't loaded yet, retry
    setTimeout(extractIdentity, 500);
    return;
  }

  window.postMessage(
    {
      source: "mhcm-main-world",
      payload: {
        type: "identity",
        // MH API returns IDs inconsistently as number or string - normalize
        userId: Number(user.user_id),
        snUserId: String(user.sn_user_id),
        uniqueHash: user.unique_hash,
        email: (window as any).userEmail || null,
        // Extract journal ID from window object (required for treasure_map API calls)
        lastReadJournalEntryId: (window as any).lastReadJournalEntryId || null,
        // Player rank (MH title)
        titleId: typeof user.title_id === "number" ? user.title_id : null,
        titleName: typeof user.title_name === "string" ? user.title_name : null,
      },
    },
    "*"
  );

  // Extract active maps from window.user on page load (no AJAX needed)
  extractActiveMaps({ user });
}

// Extract on load
extractIdentity();

function extractMapData(data: any): void {
  let map = data?.treasure_map;
  // useconvertible.php returns treasure_map as a JSON string
  if (typeof map === "string") {
    try { map = JSON.parse(map); } catch { return; }
  }
  if (!map?.map_type || !map?.map_id) return;

  window.postMessage(
    {
      source: "mhcm-main-world",
      payload: {
        type: "map_discovered",
        mapType: map.map_type,
        quality: map.quality || "common",
        name: map.name || "",
        maxHunters: map.max_hunters || 5,
        // MH API returns map_id inconsistently as number or string - normalize
        mapId: Number(map.map_id),
        isOwner: !!map.is_owner,
        rewardType: map.reward?.type || "",
        thumbnail: map.reward?.thumb_transparent || "",
        mapClass: map.map_class ?? "treasure",
        isScavengerHunt: !!map.is_scavenger_hunt,
        minTitleName: map.min_title_name || "",
      },
    },
    "*"
  );
}

function extractActiveMaps(data: any): void {
  const maps = data?.user?.quests?.QuestRelicHunter?.maps;
  if (!Array.isArray(maps)) return;

  window.postMessage(
    {
      source: "mhcm-main-world",
      payload: {
        type: "active_maps_detected",
        maps: maps.map((m: any) => ({
          // MH API returns map_id inconsistently as number or string - normalize
          map_id: Number(m.map_id),
          name: m.name ?? "",
          num_found: m.num_found ?? 0,
          num_total: m.num_total ?? 0,
          is_rare: m.is_rare ?? null,
          map_class: m.map_class ?? "treasure",
        })),
      },
    },
    "*"
  );
}

// Send per-hunter data so the service worker can check only the sniper's catches.
function extractCompletedGoals(data: any): void {
  let map = data?.treasure_map;
  if (typeof map === "string") {
    try { map = JSON.parse(map); } catch { return; }
  }
  if (!map?.map_id || !Array.isArray(map.hunters)) return;

  const goalType = map.is_scavenger_hunt ? "item" as const : "mouse" as const;
  const hunterCatches: Array<{ snUserId: string; completedGoalIds: number[] }> = [];
  for (const hunter of map.hunters) {
    const completed = hunter.completed_goal_ids?.[goalType];
    if (Array.isArray(completed) && completed.length > 0 && hunter.sn_user_id) {
      hunterCatches.push({
        snUserId: String(hunter.sn_user_id),
        completedGoalIds: completed,
      });
    }
  }

  if (hunterCatches.length === 0) return;

  window.postMessage(
    {
      source: "mhcm-main-world",
      payload: {
        type: "catches_detected",
        mapId: Number(map.map_id),
        goalType,
        hunterCatches,
      },
    },
    "*"
  );
}

function extractMapComplete(data: any): void {
  let map = data?.treasure_map;
  if (typeof map === "string") {
    try { map = JSON.parse(map); } catch { return; }
  }
  if (!map?.map_id || !map.is_complete) return;

  window.postMessage(
    {
      source: "mhcm-main-world",
      payload: {
        type: "map_complete_detected",
        mapId: Number(map.map_id),
        mapName: map.name || "",
      },
    },
    "*"
  );
}

function extractMapHunterData(data: any): void {
  let map = data?.treasure_map;
  if (typeof map === "string") {
    try { map = JSON.parse(map); } catch { return; }
  }
  if (!map?.map_id || !Array.isArray(map.hunters)) return;

  // MH hunters array includes departed hunters - only count active ones
  const activeHunters = map.hunters.filter((h: any) => h.is_active !== false);

  window.postMessage({
    source: "mhcm-main-world",
    payload: {
      type: "map_hunters_updated",
      mapId: Number(map.map_id),
      numActiveHunters: activeHunters.length,
      maxHunters: map.max_hunters ?? 0,
      invitedHunters: Array.isArray(map.invited_hunters)
        ? map.invited_hunters.map(String)
        : [],
      isOwner: !!map.is_owner,
      activeHunterSnUserIds: activeHunters.map((h: any) => String(h.sn_user_id)),
    },
  }, "*");
}

let xhrLoggingEnabled = false;

// Listen for messages from the content script (isolated world)
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "mhcm-content-script") return;
  if (event.data.type === "xhr_logging_state") {
    xhrLoggingEnabled = event.data.payload.enabled;
  }
  if (event.data.type === "request_active_maps") {
    extractActiveMaps({ user: (window as any).user });
  }
});

function sendXhrLog(url: string, data: any): void {
  if (!xhrLoggingEnabled) return;
  window.postMessage(
    {
      source: "mhcm-main-world",
      payload: {
        type: "xhr_log",
        // Nested payload matches XhrLogMessage shape once the content script wraps it
        source: "xhr_intercept" as const,
        url,
        responseData: data,
        timestamp: new Date().toISOString(),
      },
    },
    "*"
  );
}

function isMhUrl(url?: string): boolean {
  if (!url) return false;
  // Absolute URL from another domain – skip
  if (url.startsWith("http://") || url.startsWith("https://")) {
    if (!url.includes("mousehuntgame.com")) return false;
  }
  // Only process game API endpoints (all live under /managers/ajax/)
  return url.includes("managers/ajax");
}

function extractPlayerRank(data: any): void {
  const titleId = data?.user?.title_id;
  if (typeof titleId !== "number" || titleId <= 0) return;
  const titleName = typeof data?.user?.title_name === "string" ? data.user.title_name : undefined;

  window.postMessage(
    {
      source: "mhcm-main-world",
      payload: { type: "player_rank", titleId, titleName },
    },
    "*"
  );
}

function processResponse(data: any, url?: string): void {
  extractMapData(data);
  extractActiveMaps(data);
  extractCompletedGoals(data);
  extractMapComplete(data);
  extractMapHunterData(data);
  extractPlayerRank(data);
  if (url) sendXhrLog(url, data);
}

// Intercept XMLHttpRequest (game uses jQuery AJAX)
const origXHROpen = XMLHttpRequest.prototype.open;
(XMLHttpRequest.prototype as any).open = function (
  method: string,
  url: string | URL,
  ...rest: any[]
) {
  (this as any).__mhcmUrl = String(url);
  return origXHROpen.apply(this, [method, url, ...rest] as any);
};

const origXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function (body) {
  this.addEventListener("load", function () {
    const url: string | undefined = (this as any).__mhcmUrl;
    if (!isMhUrl(url)) return;
    try {
      processResponse(JSON.parse(this.responseText), url);
    } catch {
      // Not JSON or parse error – ignore
    }
  });
  return origXHRSend.call(this, body);
};

// Intercept fetch (in case game or other extensions use it)
const origFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  const fetchUrl = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const result = origFetch.call(window, input, init);

  result.then((response) => {
    if (!isMhUrl(fetchUrl)) return;
    const clone = response.clone();
    clone
      .json()
      .then((data) => processResponse(data, fetchUrl))
      .catch(() => {});
  }).catch(() => {});

  return result;
};
