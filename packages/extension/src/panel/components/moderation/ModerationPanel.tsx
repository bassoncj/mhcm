import { useState, useEffect } from "preact/hooks";
import type { MouseTier, MouseTierWithInfo, ItemTierWithInfo } from "@mhcm/shared";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { mapMouseTiers, mapItemTiers, modMice, modScrolls, modRanks, modMapTypes, modUsers } from "../../signals/moderation.js";
import { MouseTierManager } from "./MouseTierManager.js";
import { ItemModeration } from "./ItemModeration.js";
import { ModUserList } from "./ModUserList.js";
import { IconX } from "../common/Icons.js";
import { PaginationBar } from "../common/PaginationBar.js";

type SubTab = "maps" | "users" | "mice" | "items";
const MAP_PAGE_SIZE = 20;

const RANK_KEYWORDS = ["Easy", "Medium", "Hard", "Elaborate", "Arduous", "Elite"];

export function ModerationPanel() {
  const [subTab, setSubTab] = useState<SubTab>("maps");
  const [mapSearch, setMapSearch] = useState("");
  const [mapPage, setMapPage] = useState(0);
  const [marketFilter, setMarketFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addMouseSearch, setAddMouseSearch] = useState("");
  const [addMouseTier, setAddMouseTier] = useState<MouseTier>("S");
  const [showAddMouseDropdown, setShowAddMouseDropdown] = useState(false);
  const [scrollSearch, setScrollSearch] = useState("");
  const [showScrollDropdown, setShowScrollDropdown] = useState(false);

  useEffect(() => {
    wsSend({ type: "mod_get_map_types", payload: {} });
    wsSend({ type: "mod_get_users", payload: {} });
    wsSend({ type: "mod_get_scrolls", payload: { search: "" } });
    wsSend({ type: "mod_get_ranks" });
  }, []);

  // Fetch map mouse or item tiers when a map is expanded (based on goal type)
  useEffect(() => {
    if (expandedId !== null) {
      const mt = modMapTypes.value.find(m => m.id === expandedId);
      if (mt?.goal === "item") {
        wsSend({ type: "mod_get_map_item_tiers", payload: { mapTypeId: expandedId } });
      } else {
        wsSend({ type: "mod_get_map_mouse_tiers", payload: { mapTypeId: expandedId } });
        // Also fetch mice for the add dropdown if not loaded
        if (modMice.value.length === 0) {
          wsSend({ type: "mod_list_mice", payload: { limit: 1000 } });
        }
      }
    }
    setShowAddMouseDropdown(false);
    setAddMouseSearch("");
  }, [expandedId]);

  const handleAddMouseTier = (mouseId: number) => {
    if (expandedId === null) return;
    wsSend({
      type: "mod_set_mouse_map_tier",
      payload: { mouseId, mapTypeId: expandedId, tier: addMouseTier },
    });
    // Refresh the map tiers
    wsSend({ type: "mod_get_map_mouse_tiers", payload: { mapTypeId: expandedId } });
    setShowAddMouseDropdown(false);
    setAddMouseSearch("");
  };

  const handleDeleteMouseTier = (mouseId: number) => {
    if (expandedId === null) return;
    wsSend({
      type: "mod_delete_mouse_map_tier",
      payload: { mouseId, mapTypeId: expandedId },
    });
    // Refresh the map tiers
    wsSend({ type: "mod_get_map_mouse_tiers", payload: { mapTypeId: expandedId } });
  };

  const handleUpdateMouseTier = (mouseId: number, tier: MouseTier) => {
    if (expandedId === null) return;
    wsSend({
      type: "mod_set_mouse_map_tier",
      payload: { mouseId, mapTypeId: expandedId, tier },
    });
    // Refresh the map tiers
    wsSend({ type: "mod_get_map_mouse_tiers", payload: { mapTypeId: expandedId } });
  };

  const handleToggleMarket = (id: number, market: string, enable: boolean) => {
    if (enable) {
      const mapType = modMapTypes.value.find(m => m.id === id);
      if (!mapType) return;
      if (!mapType.scrollItemType || !mapType.mapClass) return;
      if (market === "unopened" && !mapType.minRank) return;
    }
    wsSend({ type: "mod_toggle_map_type_market", payload: { mapTypeId: id, market, enable } });
  };

  const handleSaveAlias = (id: number, rawInput: string) => {
    const alias = rawInput.trim() || null;
    wsSend({ type: "mod_set_map_type_alias", payload: { mapTypeId: id, alias } });
  };

  const handleSaveThumbnail = (id: number, rawInput: string) => {
    const thumbnail = rawInput.trim() || null;
    wsSend({ type: "mod_set_map_type_thumbnail", payload: { mapTypeId: id, thumbnail } });
  };

  const handleSetLastGoalCount = (id: number, lastGoalCount: number) => {
    wsSend({ type: "mod_set_map_type_last_goal_count", payload: { mapTypeId: id, lastGoalCount } });
  };

  const mapTypes = modMapTypes.value;
  const query = mapSearch.toLowerCase();
  const filteredMaps = mapTypes.filter((mt) => {
    const anyEnabled = mt.enabledSlots || mt.enabledUnopened || mt.enabledComplete;
    if (marketFilter === "any_enabled" && !anyEnabled) return false;
    if (marketFilter === "slots" && !mt.enabledSlots) return false;
    if (marketFilter === "unopened" && !mt.enabledUnopened) return false;
    if (marketFilter === "complete" && !mt.enabledComplete) return false;
    if (marketFilter === "none" && anyEnabled) return false;
    if (!query) return true;
    return (
      mt.displayName.toLowerCase().includes(query) ||
      mt.mapType.toLowerCase().includes(query) ||
      mt.quality.toLowerCase().includes(query) ||
      (mt.alias?.toLowerCase().includes(query) ?? false)
    );
  });

  const mapTotalPages = Math.ceil(filteredMaps.length / MAP_PAGE_SIZE);
  const pagedMaps = filteredMaps.slice(mapPage * MAP_PAGE_SIZE, (mapPage + 1) * MAP_PAGE_SIZE);

  const enabledCount = mapTypes.filter((m) => m.enabledSlots || m.enabledUnopened || m.enabledComplete).length;

  return (
    <div class="moderation-panel">

      <nav class="sub-tabs">
        <button
          class={subTab === "maps" ? "active" : ""}
          onClick={() => setSubTab("maps")}
        >
          Maps ({enabledCount}/{mapTypes.length})
        </button>
        <button
          class={subTab === "items" ? "active" : ""}
          onClick={() => setSubTab("items")}
        >
          Items
        </button>
        <button
          class={subTab === "mice" ? "active" : ""}
          onClick={() => setSubTab("mice")}
        >
          Mice
        </button>
        <button
          class={subTab === "users" ? "active" : ""}
          onClick={() => setSubTab("users")}
        >
          Users ({modUsers.value.length})
        </button>
      </nav>

      {subTab === "maps" && (
        <section class="mod-section">
          <div class="search-row">
            <div class="search-input-wrap">
              <input
                type="text"
                class="search-input"
                placeholder="Search maps..."
                value={mapSearch}
                onInput={(e) => { setMapSearch((e.target as HTMLInputElement).value); setMapPage(0); }}
              />
              {mapSearch && (
                <button type="button" class="search-clear" onClick={() => { setMapSearch(""); setMapPage(0); }}>
                  <IconX size={14} />
                </button>
              )}
            </div>
            <select
              class="filter-select"
              value={marketFilter}
              onChange={(e) => {
                setMarketFilter((e.target as HTMLSelectElement).value);
                setMapPage(0);
              }}
            >
              <option value="all">All Maps</option>
              <option value="any_enabled">Any Enabled</option>
              <option value="slots">Slots Enabled</option>
              <option value="unopened">Unopened Enabled</option>
              <option value="complete">Complete Enabled</option>
              <option value="none">None Enabled</option>
            </select>
          </div>

          <div class="mod-row-header">
            <span class="mod-row-header-name">Name</span>
            <span class="mod-row-header-controls">Quality / Status</span>
          </div>
          <div class="mod-table-wrap">
          <div class="item-list">
              {pagedMaps.map((mt) => (
                <div key={mt.id}>
                <div
                  class={`item-row${(mt.enabledSlots || mt.enabledUnopened || mt.enabledComplete) ? " row-enabled" : ""}${expandedId === mt.id ? " row-expanded" : ""}`}
                  onClick={() => setExpandedId(expandedId === mt.id ? null : mt.id)}
                >
                  <div class="item-row-info">
                      {mt.thumbnail && (
                        <img class="mod-thumb" src={mt.thumbnail} alt="" />
                      )}
                      <div class="item-row-name">
                        <span class="map-name">{mt.displayName}</span>
                        <span class="alias-hint">{mt.alias || mt.mapType}</span>
                      </div>
                  </div>
                  <div class="item-tier-controls">
                    <span class={`quality ${mt.quality}`}>{mt.quality}</span>
                    <span class="market-badges">
                      <span class={`market-badge${mt.enabledSlots ? " active" : ""}`} title="Slots">S</span>
                      <span class={`market-badge${mt.enabledUnopened ? " active" : ""}`} title="Unopened">U</span>
                      <span class={`market-badge${mt.enabledComplete ? " active" : ""}`} title="Complete">C</span>
                    </span>
                  </div>
                </div>
                {expandedId === mt.id && (
                  <div class="item-drawer">
                      <div class="map-detail-drawer">
                        <div class="map-detail-grid">
                          <span class="map-detail-label">ID</span>
                          <span class="map-detail-value">{mt.id}</span>

                          <span class="map-detail-label">Name</span>
                          <span class="map-detail-value">{mt.displayName}</span>

                          <span class="map-detail-label">Type</span>
                          <span class="map-detail-value map-detail-type">{mt.mapType}</span>

                          <span class="map-detail-label">Quality</span>
                          <span class="map-detail-value">
                            <span class={`quality ${mt.quality}`}>{mt.quality}</span>
                          </span>

                          <span class="map-detail-label">Thumbnail</span>
                          <div class="map-detail-thumb-wrap">
                            {mt.thumbnail && (
                              <img class="map-detail-thumb-preview" src={mt.thumbnail} alt="" />
                            )}
                            <input
                              class="map-detail-input"
                              type="text"
                              defaultValue={mt.thumbnail ?? ""}
                              placeholder="Thumbnail URL..."
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleSaveThumbnail(mt.id, (e.target as HTMLInputElement).value);
                                }
                              }}
                              onBlur={(e) => {
                                handleSaveThumbnail(mt.id, (e.target as HTMLInputElement).value);
                              }}
                            />
                          </div>

                          <span class="map-detail-label">Alias</span>
                          <div>
                            <input
                              class="map-detail-input"
                              type="text"
                              defaultValue={mt.alias ?? ""}
                              placeholder="Alias..."
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleSaveAlias(mt.id, (e.target as HTMLInputElement).value);
                                }
                              }}
                              onBlur={(e) => {
                                handleSaveAlias(mt.id, (e.target as HTMLInputElement).value);
                              }}
                            />
                          </div>

                          <span class="map-detail-label">Last Goal</span>
                          <div class="map-detail-toggle" onClick={(e) => e.stopPropagation()}>
                            <select
                              class="map-detail-input"
                              value={mt.lastGoalCount}
                              onChange={(e) => {
                                handleSetLastGoalCount(mt.id, Number((e.target as HTMLSelectElement).value));
                              }}
                            >
                              <option value={1}>{mt.goal === "item" ? "LL (1 item)" : "LM (1 mouse)"}</option>
                              <option value={2}>{mt.goal === "item" ? "L2L (1-2 items)" : "L2M (1-2 mice)"}</option>
                              <option value={3}>{mt.goal === "item" ? "L3L (1-3 items)" : "L3M (1-3 mice)"}</option>
                            </select>
                          </div>

                          {/* Scroll Linkage Section */}
                          <span class="map-detail-label">Linked Scroll</span>
                          <div class="scroll-linkage-section" onClick={(e) => e.stopPropagation()}>
                            {mt.scrollItemType ? (
                              <ul class="map-tier-list">
                                <li>
                                  {(() => {
                                    const scroll = modScrolls.value.find(s => s.type === mt.scrollItemType);
                                    return (
                                      <>
                                        {scroll?.thumbnail && (
                                          <img class="mouse-thumb-sm" src={scroll.thumbnail} alt="" />
                                        )}
                                        <span class="map-tier-mouse-name">{scroll?.name || mt.scrollItemType}</span>
                                        <button
                                          class="btn-delete-tier"
                                          onClick={() => {
                                            wsSend({ type: "mod_set_map_scroll", payload: { mapTypeId: mt.id, scrollItemType: null } });
                                          }}
                                          title="Remove scroll linkage"
                                        >
                                          <IconX size={12} />
                                        </button>
                                      </>
                                    );
                                  })()}
                                </li>
                              </ul>
                            ) : (
                              <div class="scroll-dropdown-container">
                                <div class="search-input-with-clear">
                                  <input
                                    type="text"
                                    placeholder="Search scrolls..."
                                    value={expandedId === mt.id ? scrollSearch : ""}
                                    onInput={(e) => setScrollSearch((e.target as HTMLInputElement).value)}
                                    onFocus={() => setShowScrollDropdown(true)}
                                  />
                                  {scrollSearch && (
                                    <button
                                      type="button"
                                      class="search-clear-btn"
                                      onClick={() => {
                                        setScrollSearch("");
                                        setShowScrollDropdown(false);
                                      }}
                                    >
                                      <IconX size={12} />
                                    </button>
                                  )}
                                </div>
                                {showScrollDropdown && expandedId === mt.id && scrollSearch.length > 0 && (
                                  <ul class="mouse-search-results">
                                    {modScrolls.value
                                      .filter(s => s.name.toLowerCase().includes(scrollSearch.toLowerCase()) || s.type.toLowerCase().includes(scrollSearch.toLowerCase()))
                                      .slice(0, 10)
                                      .map(scroll => (
                                        <li
                                          key={scroll.id}
                                          onClick={() => {
                                            wsSend({ type: "mod_set_map_scroll", payload: { mapTypeId: mt.id, scrollItemType: scroll.type } });
                                            setScrollSearch("");
                                            setShowScrollDropdown(false);
                                          }}
                                        >
                                          {scroll.thumbnail && <img src={scroll.thumbnail} alt="" class="mouse-thumb-xs" />}
                                          <span class="mouse-result-name">{scroll.name}</span>
                                        </li>
                                      ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Min Rank Section */}
                          <span class="map-detail-label">Min Rank</span>
                          <div>
                            <select
                              class="map-detail-input"
                              value={mt.minRank ?? "None"}
                              onChange={(e) => {
                                const val = (e.target as HTMLSelectElement).value;
                                const rankId = val === "None" ? null : parseInt(val, 10);
                                wsSend({ type: "mod_set_map_min_rank", payload: { mapTypeId: mt.id, minRank: rankId } });
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="None">None</option>
                              {modRanks.value.map(rank => (
                                <option key={rank.id} value={rank.id}>{rank.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Map Class Section */}
                          <span class="map-detail-label">Map Class</span>
                          <div>
                            <select
                              class="map-detail-input"
                              value={mt.mapClass ?? ""}
                              onChange={(e) => {
                                const val = (e.target as HTMLSelectElement).value;
                                const mapClass = val === "" ? null : val;
                                wsSend({ type: "mod_set_map_class", payload: { mapTypeId: mt.id, mapClass } });
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">Not Set</option>
                              <option value="treasure">Treasure</option>
                              <option value="event">Event</option>
                              <option value="poster">Poster</option>
                            </select>
                          </div>
                        </div>

                        {/* Per-Market Enable/Disable */}
                        <div class="market-toggles-section" onClick={(e) => e.stopPropagation()}>
                          <h4>Markets</h4>
                          <div class="market-toggle-row">
                            <span class="market-toggle-label">Slots</span>
                            <label class="toggle-switch">
                              <input type="checkbox" checked={mt.enabledSlots} onChange={() => handleToggleMarket(mt.id, "slots", !mt.enabledSlots)} />
                              <span class="toggle-slider" />
                            </label>
                          </div>
                          <div class="market-toggle-row">
                            <span class="market-toggle-label">Unopened</span>
                            <label class="toggle-switch">
                              <input type="checkbox" checked={mt.enabledUnopened} onChange={() => handleToggleMarket(mt.id, "unopened", !mt.enabledUnopened)} />
                              <span class="toggle-slider" />
                            </label>
                          </div>
                          <div class="market-toggle-row">
                            <span class="market-toggle-label">Complete</span>
                            <label class="toggle-switch">
                              <input type="checkbox" checked={mt.enabledComplete} onChange={() => handleToggleMarket(mt.id, "complete", !mt.enabledComplete)} />
                              <span class="toggle-slider" />
                            </label>
                          </div>
                          <div class="market-toggle-row">
                            <span class="market-toggle-label">Return Tradables</span>
                            <label class="toggle-switch">
                              <input type="checkbox" checked={mt.supportsRt} onChange={() => {
                                wsSend({ type: "mod_set_map_supports_rt", payload: { mapTypeId: mt.id, supportsRt: !mt.supportsRt } });
                              }} />
                              <span class="toggle-slider" />
                            </label>
                          </div>
                        </div>

                        {/* Mouse Tier Overrides – only for mouse-goal maps */}
                        {mt.goal === "mouse" && (
                        <div class="map-mouse-tiers-section">
                          <h4>Mouse Tier Overrides</h4>
                          {(() => {
                            const tiers = mapMouseTiers.value[mt.id] || [];
                            const existingMouseIds = new Set(tiers.map((t) => t.mouseTypeId));
                            const availableMice = modMice.value.filter(
                              (m) => !existingMouseIds.has(m.id) &&
                                (addMouseSearch === "" ||
                                  m.name.toLowerCase().includes(addMouseSearch.toLowerCase()) ||
                                  m.type.toLowerCase().includes(addMouseSearch.toLowerCase()))
                            ).slice(0, 20);

                            return (
                              <>
                                {tiers.length === 0 ? (
                                  <p class="no-map-tiers">No mouse tier overrides for this map.</p>
                                ) : (
                                  <ul class="map-tier-list">
                                    {tiers.map((t) => (
                                      <li key={t.mouseTypeId}>
                                        {t.mouseThumbnail && (
                                          <img class="mouse-thumb-sm" src={t.mouseThumbnail} alt="" />
                                        )}
                                        <span class="map-tier-mouse-name">{t.mouseName}</span>
                                        <div class="map-tier-buttons">
                                          {(["S", "A", "B"] as MouseTier[]).map((tier) => (
                                            <button
                                              key={tier}
                                              class={`tier-btn-sm tier-btn-${tier.toLowerCase()}${t.mapTier === tier ? " active" : ""}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleUpdateMouseTier(t.mouseTypeId, tier);
                                              }}
                                            >
                                              {tier}
                                            </button>
                                          ))}
                                        </div>
                                        <button
                                          class="btn-delete-tier"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteMouseTier(t.mouseTypeId);
                                          }}
                                          title="Remove override"
                                        >
                                          <IconX size={12} />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                <div class="add-mouse-tier-row">
                                  {showAddMouseDropdown ? (
                                    <div class="add-mouse-dropdown" onClick={(e) => e.stopPropagation()}>
                                      <div class="form-row">
                                        <div class="search-input-with-clear">
                                          <input
                                            type="text"
                                            placeholder="Search mice..."
                                            value={addMouseSearch}
                                            onInput={(e) => setAddMouseSearch((e.target as HTMLInputElement).value)}
                                            autoFocus
                                          />
                                          {addMouseSearch && (
                                            <button
                                              type="button"
                                              class="search-clear-btn"
                                              onClick={() => setAddMouseSearch("")}
                                            >
                                              <IconX size={12} />
                                            </button>
                                          )}
                                        </div>
                                        <select
                                          class="add-tier-select"
                                          value={addMouseTier}
                                          onChange={(e) => setAddMouseTier((e.target as HTMLSelectElement).value as MouseTier)}
                                        >
                                          <option value="S">S</option>
                                          <option value="A">A</option>
                                          <option value="B">B</option>
                                        </select>
                                        <button
                                          class="btn-small"
                                          onClick={() => {
                                            setShowAddMouseDropdown(false);
                                            setAddMouseSearch("");
                                          }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                      {availableMice.length > 0 && (
                                        <ul class="mouse-search-results">
                                          {availableMice.map((m) => (
                                            <li
                                              key={m.id}
                                              onClick={() => handleAddMouseTier(m.id)}
                                            >
                                              {m.thumbnail && (
                                                <img class="mouse-thumb-xs" src={m.thumbnail} alt="" />
                                              )}
                                              <span class="mouse-result-name">{m.name}</span>
                                              {m.globalTier && (
                                                <span class={`mouse-result-tier tier-badge-sm tier-${m.globalTier.toLowerCase()}`}>
                                                  {m.globalTier}
                                                </span>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      {availableMice.length === 0 && addMouseSearch && (
                                        <p class="no-results">No mice found</p>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      class="btn-small btn-add-mouse"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAddMouseDropdown(true);
                                      }}
                                    >
                                      + Add Mouse Override
                                    </button>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        )}

                        {/* Item Tier Overrides – only for item-goal maps */}
                        {mt.goal === "item" && (
                        <div class="map-mouse-tiers-section">
                          <h4>Item Tier Overrides</h4>
                          {(() => {
                            const iTiers: ItemTierWithInfo[] = mapItemTiers.value[mt.id] || [];
                            return (
                              <>
                                {iTiers.length === 0 ? (
                                  <p class="no-map-tiers">No item tier overrides for this map.</p>
                                ) : (
                                  <ul class="map-tier-list">
                                    {iTiers.map((t) => (
                                      <li key={t.itemTypeId}>
                                        {t.itemThumbnail && (
                                          <img class="mouse-thumb-sm" src={t.itemThumbnail} alt="" />
                                        )}
                                        <span class="map-tier-mouse-name">{t.itemName}</span>
                                        <div class="map-tier-buttons">
                                          {(["S", "A", "B"] as const).map((tier) => (
                                            <button
                                              key={tier}
                                              class={`tier-btn-sm tier-btn-${tier.toLowerCase()}${t.mapTier === tier ? " active" : ""}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                wsSend({ type: "mod_set_item_map_tier", payload: { itemId: t.itemTypeId, mapTypeId: mt.id, tier } });
                                                wsSend({ type: "mod_get_map_item_tiers", payload: { mapTypeId: mt.id } });
                                              }}
                                            >
                                              {tier}
                                            </button>
                                          ))}
                                        </div>
                                        <button
                                          class="btn-delete-tier"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            wsSend({ type: "mod_delete_item_map_tier", payload: { itemId: t.itemTypeId, mapTypeId: mt.id } });
                                            wsSend({ type: "mod_get_map_item_tiers", payload: { mapTypeId: mt.id } });
                                          }}
                                          title="Remove override"
                                        >
                                          <IconX size={12} />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <p class="help-text">Add item overrides from the Items tab.</p>
                              </>
                            );
                          })()}
                        </div>
                        )}
                      </div>
                  </div>
                )}
                </div>
              ))}
          </div>
          </div>

          {mapTotalPages > 1 && <PaginationBar page={mapPage} totalPages={mapTotalPages} onPageChange={setMapPage} />}

          <p class="mouse-count">
            Showing {pagedMaps.length} of {filteredMaps.length} maps
          </p>

          {filteredMaps.length === 0 && (
            <p class="empty">
              {mapSearch ? "No maps match your search." : "No map types configured."}
            </p>
          )}
        </section>
      )}

      {subTab === "items" && <ItemModeration />}

      {subTab === "mice" && (
        <section class="mod-section">
          <MouseTierManager />
        </section>
      )}

      {subTab === "users" && (
        <section class="mod-section mod-section-auto">
          <ModUserList />
        </section>
      )}

    </div>
  );
}
