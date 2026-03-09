import {
  MH_BASE_URL,
  MH_ENDPOINTS,
} from "@mhcm/shared";
import type {
  MHTreasureMap,
  MHTreasureMapInvite,
  MHBoardPage,
  MHActiveMap,
  MHInventoryItem,
} from "@mhcm/shared";

let xhrLoggingEnabled = false;
let xhrLogCallback: ((entry: any) => void) | null = null;

export function setXhrLoggingEnabled(enabled: boolean): void {
  xhrLoggingEnabled = enabled;
}

/** Register a callback for sending XHR logs (avoids circular dep with bridge). */
export function setXhrLogCallback(cb: (entry: any) => void): void {
  xhrLogCallback = cb;
}

// The MH API requires last_read_journal_entry_id on treasure map and page.php
// requests. Initialized via a page.php call on startup and updated from each
// API response that returns it.
let lastJournalEntryId: number | null = null;

export function setJournalEntryId(id: number | null): void {
  if (id != null) {
    lastJournalEntryId = id;
  }
}

export async function fetchLatestJournalEntryId(uh: string): Promise<void> {
  // Already have a journal ID (fetched previously or captured from an API response)
  if (lastJournalEntryId != null) return;

  try {
    const data = await gamePost(MH_ENDPOINTS.PAGE, {
      uh,
      page_class: "Camp",
    });

    // gamePost's auto-update may have already captured it from the top-level response
    if (lastJournalEntryId != null) return;

    // Otherwise parse from the journal entries HTML
    const entriesString: string | undefined =
      data?.page?.journal?.entries_string;
    if (entriesString) {
      const match = entriesString.match(
        /id="journallatestentry".*?data-entry-id='(\d+)'/
      );
      if (match?.[1]) {
        lastJournalEntryId = parseInt(match[1], 10);
      }
    }
  } catch (err) {
    console.warn("[mhcm] failed to fetch journal entry ID:", err);
  }
}

/** Endpoints that require last_read_journal_entry_id in the request body. */
const JOURNAL_ID_ENDPOINTS: string[] = [
  MH_ENDPOINTS.TREASURE_MAP,
  MH_ENDPOINTS.PAGE,
];

async function gamePost(
  endpoint: string,
  params: Record<string, string> | URLSearchParams
): Promise<any> {
  let body: URLSearchParams;
  if (params instanceof URLSearchParams) {
    body = params;
  } else {
    body = new URLSearchParams({
      sn: "Hitgrab",
      hg_is_ajax: "1",
      ...params,
    });
  }

  // Auto-include journal entry ID for applicable endpoints
  if (
    lastJournalEntryId != null &&
    JOURNAL_ID_ENDPOINTS.includes(endpoint) &&
    !body.has("last_read_journal_entry_id")
  ) {
    body.append("last_read_journal_entry_id", String(lastJournalEntryId));
  }

  const response = await fetch(`${MH_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
  });

  if (!response.ok) {
    // Log the failed response for diagnostics before throwing
    if (xhrLoggingEnabled && xhrLogCallback) {
      const reqBody: Record<string, string> = {};
      body.forEach((v, k) => { reqBody[k] = v; });
      let responseBody: any = null;
      try { responseBody = await response.clone().text(); } catch {}
      xhrLogCallback({
        type: "xhr_log",
        payload: {
          source: "api_call",
          url: `${MH_BASE_URL}${endpoint}`,
          requestBody: reqBody,
          responseData: { httpStatus: response.status, body: responseBody },
          timestamp: new Date().toISOString(),
        },
      });
    }
    throw new Error(`MH API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Auto-update journal entry ID from response
  if (data?.last_read_journal_entry_id != null) {
    lastJournalEntryId = data.last_read_journal_entry_id;
  }

  // XHR diagnostic logging: capture our API calls and their responses
  if (xhrLoggingEnabled && xhrLogCallback) {
    const reqBody: Record<string, string> = {};
    body.forEach((v, k) => { reqBody[k] = v; });
    xhrLogCallback({
      type: "xhr_log",
      payload: {
        source: "api_call",
        url: `${MH_BASE_URL}${endpoint}`,
        requestBody: reqBody,
        responseData: data,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // getmiceeffectiveness.php returns success:0 even with valid data.
  // Override when the expected effectiveness payload is present.
  if (data && !data.success && data.effectiveness) {
    data.success = 1;
  }

  // MH returns HTTP 200 even on failure, with success=0 in the JSON body.
  // Without this check, void-returning callers (transferSupplies, leaveMap)
  // silently swallow failures and report success to the orchestrator.
  if (data && "success" in data && !data.success) {
    const msg = data.error || data.message || JSON.stringify(data).slice(0, 200);
    throw new Error(`MH API rejected: ${msg}`);
  }

  return data;
}

function mapParams(
  uh: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  return { uh, ...extra };
}

export interface MapInventoryResult {
  activeMaps: MHActiveMap[];
  scrollCases: Array<{ type: string; name: string; quantity: number }>;
}

export async function getMapInventory(uh: string): Promise<MapInventoryResult> {
  const data = await gamePost(
    MH_ENDPOINTS.TREASURE_MAP,
    mapParams(uh, { action: "get_inventory" })
  );

  const quest = data?.user?.quests?.QuestRelicHunter;
  const activeMaps: MHActiveMap[] = quest?.maps ?? [];
  const scrollCases = data?.treasure_map_inventory?.items ?? [];

  return { activeMaps, scrollCases };
}

export async function getMapInfo(
  uh: string,
  mapId: number
): Promise<MHTreasureMap> {
  const data = await gamePost(
    MH_ENDPOINTS.TREASURE_MAP,
    mapParams(uh, { action: "map_info", map_id: String(mapId) })
  );

  return data.treasure_map;
}

export async function sendInvites(
  uh: string,
  mapId: number,
  snuids: string[]
): Promise<MHTreasureMap> {
  const body = new URLSearchParams();
  body.append("sn", "Hitgrab");
  body.append("hg_is_ajax", "1");
  body.append("uh", uh);
  body.append("action", "send_invites");
  body.append("map_id", String(mapId));
  for (const snuid of snuids) {
    body.append("snuids[]", snuid);
  }

  const data = await gamePost(MH_ENDPOINTS.TREASURE_MAP, body);
  return data.treasure_map;
}

export async function getReceivedInvites(
  uh: string
): Promise<MHTreasureMapInvite[]> {
  const data = await gamePost(
    MH_ENDPOINTS.TREASURE_MAP,
    mapParams(uh, { action: "get_received_invites" })
  );

  return data.treasure_map_invites ?? [];
}

export async function acceptInvite(
  uh: string,
  mapId: number
): Promise<MHTreasureMap> {
  const data = await gamePost(
    MH_ENDPOINTS.TREASURE_MAP,
    mapParams(uh, { action: "accept_invite", map_id: String(mapId) })
  );

  return data.treasure_map;
}

export async function cancelInvites(
  uh: string,
  mapId: number,
  snuids: string[]
): Promise<void> {
  const body = new URLSearchParams();
  body.append("sn", "Hitgrab");
  body.append("hg_is_ajax", "1");
  body.append("uh", uh);
  body.append("action", "cancel_invites");
  body.append("map_id", String(mapId));
  for (const snuid of snuids) {
    body.append("snuids[]", snuid);
  }

  await gamePost(MH_ENDPOINTS.TREASURE_MAP, body);
}

export async function transferOwnership(
  uh: string,
  mapId: number,
  newOwnerSnUserId: string
): Promise<MHTreasureMap> {
  const data = await gamePost(
    MH_ENDPOINTS.TREASURE_MAP,
    mapParams(uh, {
      action: "transfer",
      map_id: String(mapId),
      new_owner_sn_user_id: newOwnerSnUserId,
    })
  );

  return data.treasure_map;
}

export async function claimChest(
  uh: string,
  mapId: number
): Promise<any> {
  return gamePost(
    MH_ENDPOINTS.TREASURE_MAP,
    mapParams(uh, { action: "claim", map_id: String(mapId) })
  );
}

export async function leaveMap(
  uh: string,
  mapId: number
): Promise<void> {
  await gamePost(
    MH_ENDPOINTS.TREASURE_MAP,
    mapParams(uh, { action: "discard", map_id: String(mapId) })
  );
}

export async function transferSupplies(
  uh: string,
  receiverSnUserId: string,
  item: string,
  quantity: number
): Promise<void> {
  await gamePost(MH_ENDPOINTS.SUPPLY_TRANSFER, {
    uh,
    receiver: receiverSnUserId,
    item,
    item_quantity: String(quantity),
  });
}

export async function getItemQuantity(uh: string, itemType: string): Promise<number> {
  const data = await gamePost(MH_ENDPOINTS.USER_INVENTORY, {
    uh,
    action: "get_items",
    "item_types[]": itemType,
  });

  const items: MHInventoryItem[] = data?.items ?? [];
  const item = items.find((i) => i.type === itemType);
  return item?.quantity ?? 0;
}

/**
 * Open a chest (convertible item) and return the items received + inventory.
 * Used in RT flow to identify tradable items after map completion.
 *
 * @returns Items from the chest and inventory with is_tradable flags
 */
export async function openChest(
  uh: string,
  chestItemType: string
): Promise<{
  items: Array<{ type: string; name: string; quantity: number; thumbnail?: string }>;
  inventory: Record<string, { is_tradable?: boolean | null }>;
}> {
  const data = await gamePost(MH_ENDPOINTS.USE_CONVERTIBLE, {
    uh,
    item_type: chestItemType,
    item_qty: "1",
  });

  // convertible_open.items[] contains the loot
  const rawItems: any[] = data?.convertible_open?.items ?? [];
  const items = rawItems.map((item: any) => ({
    type: item.type as string,
    name: item.name as string,
    quantity: Number(item.quantity) || 1,
    ...(item.thumb && { thumbnail: item.thumb as string }),
  }));

  // inventory[type] contains is_tradable flag
  const inventory: Record<string, { is_tradable?: boolean | null }> = {};
  if (data?.inventory) {
    for (const [key, value] of Object.entries(data.inventory)) {
      inventory[key] = { is_tradable: (value as any)?.is_tradable ?? null };
    }
  }

  return { items, inventory };
}

/**
 * Open a scroll case (convertible item) to create a new treasure map.
 * Used in maps marketplace unopened flow.
 *
 * @returns The created map ID and map type
 */
export async function openScroll(
  uh: string,
  scrollItemType: string
): Promise<{ mapId: number; mapType: string }> {
  const data = await gamePost(MH_ENDPOINTS.USE_CONVERTIBLE, {
    uh,
    item_type: scrollItemType,
    item_qty: "1",
  });

  // useconvertible.php returns treasure_map as a JSON string that needs parsing
  let map = data?.treasure_map;
  if (typeof map === "string") {
    try {
      map = JSON.parse(map);
    } catch {
      throw new Error("Failed to parse treasure_map response");
    }
  }

  if (!map?.map_id || !map?.map_type) {
    throw new Error("Invalid treasure_map data: missing map_id or map_type");
  }

  return {
    mapId: map.map_id as number,
    mapType: map.map_type as string,
  };
}

export async function postToCorkBoard(
  uh: string,
  body: string,
  messageBoardId: string,
  ownerUniqueId: string
): Promise<MHBoardPage> {
  const data = await gamePost(MH_ENDPOINTS.BOARD, {
    uh,
    action: "create",
    body,
    message_board_id: messageBoardId,
    board_type: "profile",
    board_page: "1",
    owner_unique_id: ownerUniqueId,
  });

  // Response has board_page at the top level (not nested under message_board_view)
  return data.board_page;
}

export async function getHunterProfile(
  uh: string,
  snuid: string
): Promise<{ boardPage: MHBoardPage; userId: number; snUserId: string; activeMapClasses: string[] }> {
  const data = await gamePost(MH_ENDPOINTS.PAGE, {
    uh,
    page_class: "HunterProfile",
    "page_arguments[snuid]": snuid,
  });

  // Board data is at page.tabs.profile.subtabs[0].message_board_view
  const subtab = data?.page?.tabs?.profile?.subtabs?.[0];
  const boardPage: MHBoardPage = subtab?.message_board_view;

  // Active map classes from the profile target's QuestRelicHunter maps array.
  // Each map entry has a map_class field ("treasure", "event", or "poster").
  const maps: any[] = data?.user?.quests?.QuestRelicHunter?.maps ?? [];
  const activeMapClasses: string[] = maps
    .map((m: any) => m?.map_class)
    .filter((c: any): c is string => typeof c === "string" && c.length > 0);

  return {
    boardPage,
    userId: data?.user?.user_id,
    snUserId: snuid,
    activeMapClasses,
  };
}

export async function fetchCampPage(uh: string): Promise<any> {
  return gamePost(MH_ENDPOINTS.PAGE, {
    uh,
    page_class: "Camp",
  });
}

export async function fetchPreferencesPage(
  uh: string
): Promise<{ allow_map_invites: boolean; allow_anonymous_supply_transfers: boolean; utc_offset: number }> {
  const data = await gamePost(MH_ENDPOINTS.PAGE, {
    uh,
    page_class: "Preferences",
  });

  const settings = data?.page?.game_settings;
  const formData = data?.page?.form_data;
  const timezone = (formData?.timezone as number) ?? 0;
  const timezoneOffset = (formData?.timezone_offset as number) ?? 0;
  return {
    allow_map_invites: !!settings?.allow_map_invites,
    allow_anonymous_supply_transfers: !!settings?.allow_anonymous_supply_transfers,
    utc_offset: timezone + timezoneOffset,
  };
}

export interface MHSupplyMessage {
  messageId: number;
  senderMhUserId: string;
  itemDisplayName: string;
  quantity: number;
  messageDateLocal: string;
}

/**
 * Fetch supply transfer notifications from the player's inbox.
 * Only returns General-tab messages that match the supply transfer text format.
 */
export async function fetchMessages(): Promise<MHSupplyMessage[]> {
  const params = new URLSearchParams();
  params.append("action", "fetch_messages");
  params.append("message_types[]", "notification");
  params.append("message_types[]", "game_request");
  params.append("message_types[]", "fb_request");
  const data = await gamePost(MH_ENDPOINTS.MESSAGES, params);

  const messages: MHSupplyMessage[] = [];
  const raw = data?.messageData?.notification?.messages;
  if (!Array.isArray(raw)) return messages;

  const pattern = /I received (\d+) (.+?) from .*?p\.php\?id=(\d+)/;
  for (const msg of raw) {
    if (msg?.messageData?.tab !== "General") continue;
    const text: string = msg?.messageData?.text ?? "";
    const match = pattern.exec(text);
    if (!match) continue;
    messages.push({
      messageId: msg.messageId ?? 0,
      senderMhUserId: match[3],
      itemDisplayName: match[2],
      quantity: parseInt(match[1], 10),
      messageDateLocal: msg.messageDate ?? "",
    });
  }

  return messages;
}

export async function getMiceEffectiveness(uh: string): Promise<{
  mice: Array<{ type: string; name: string }>;
  environmentType: string | null;
}> {
  const data = await gamePost(MH_ENDPOINTS.MICE_EFFECTIVENESS, { uh });

  const mice: Array<{ type: string; name: string }> = [];
  if (data?.effectiveness) {
    for (const diff of Object.values(data.effectiveness) as any[]) {
      if (diff?.mice && Array.isArray(diff.mice)) {
        for (const m of diff.mice) {
          if (m.type) mice.push({ type: m.type, name: m.name ?? m.type });
        }
      }
    }
  }

  return {
    mice,
    environmentType: data?.user?.environment_type ?? null,
  };
}

/**
 * Get the player's current environment type from window.user.
 * Lightweight read – no network request.
 */
export async function getPlayerEnvironment(): Promise<{ environmentType: string | null }> {
  const user = (window as any).user;
  return { environmentType: user?.environment_type ?? null };
}
