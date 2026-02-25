import { useState, useRef, useEffect } from "preact/hooks";
import type { MapType } from "@mhcm/shared";
import { mapTypes, mapTypeStats, selectedMapTypeId, showDisabledMaps, favouriteMapTypeIds, subscribedMapTypeIds } from "../../signals/slots.js";
import { activeMaps, playerTitleId } from "../../signals/game-state.js";
import { isAdmin } from "../../signals/auth.js";
import { allowAnyGoalCount } from "../../signals/admin.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconChevronDown, IconChevronUp, IconStar, IconStarFilled, IconBell, IconBellFilled, IconTag, IconX, IconBoxes } from "../common/Icons.js";

type QualityFilter = "all" | "common" | "rare";
type SortBy = "activity" | "name" | "price";

interface SelectorItem {
  id: number;
  label: string;
  quality: string;
  thumbnail: string | null;
  alias: string | null;
  activity: number;
  avgPrice: number | null;
  slots?: number;
  /** Number of goals remaining on this map (for owned maps). */
  goalsRemaining?: number;
  /** Whether this map meets the LM/LL listing requirement. */
  meetsListingRequirement: boolean;
  /** Max remaining goals for listing: 1=LM/LL, 2=L2M/L2L, 3=L3M/L3L. */
  lastGoalCount: number;
  section: "yours" | "all";
  enabled: boolean;
  sellable: boolean;
  goal: "mouse" | "item";
  minRank: number | null;
  minRankName: string | null;
}

export function MapTypeSelector() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("activity");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const types = mapTypes.value;
  const stats = mapTypeStats.value;

  // Build "Your Maps" entries from owned active maps only
  const enrichedMaps = activeMaps.value.filter(
    (m) => m.map_type && m.quality
  );
  const hasUnenrichedMaps = activeMaps.value.some((m) => !m.map_type && !m.quality);

  const ownedMapTypeIds = new Set<number>();
  const yourMapsItems: SelectorItem[] = [];

  for (const m of enrichedMaps) {
    if (!m.is_owner) continue;

    // Match active map to catalog entry via reward_type + goalType
    const catalogEntry = m.reward_type
      ? types.find((mt) => mt.mapType === m.reward_type && (!m.goalType || mt.goal === m.goalType))
      : undefined;
    if (!catalogEntry) continue; // Not yet in catalog

    if (ownedMapTypeIds.has(catalogEntry.id)) continue; // Already added
    ownedMapTypeIds.add(catalogEntry.id);

    const availableSlots =
      (m.max_hunters ?? 0) - (m.num_active_hunters ?? 0) - (m.invited_hunters?.length ?? 0);
    const typeStats = stats[catalogEntry.id];

    // Check goals remaining for LM/LL requirement (admin can bypass via setting)
    const goalsRemaining = m.remaining_goals?.length ?? 0;
    const maxAllowedGoals = catalogEntry.lastGoalCount;
    const meetsListingRequirement = allowAnyGoalCount.value || (goalsRemaining > 0 && goalsRemaining <= maxAllowedGoals);

    yourMapsItems.push({
      id: catalogEntry.id,
      label: catalogEntry.displayName,
      quality: catalogEntry.quality,
      thumbnail: catalogEntry.thumbnail,
      alias: catalogEntry.alias,
      activity: typeStats?.activity ?? 0,
      avgPrice: typeStats?.avgPrice ?? null,
      slots: availableSlots,
      goalsRemaining,
      meetsListingRequirement,
      lastGoalCount: catalogEntry.lastGoalCount,
      section: "yours",
      enabled: catalogEntry.enabledSlots,
      sellable: meetsListingRequirement,
      goal: catalogEntry.goal,
      minRank: catalogEntry.minRank,
      minRankName: catalogEntry.minRankName,
    });
  }

  // Build "All Map Types" entries from catalog
  const allItems: SelectorItem[] = types
    .filter((mt) => mt.enabledSlots || (isAdmin.value && showDisabledMaps.value))
    .map((mt) => {
      const typeStats = stats[mt.id];
      // Check if user owns this map type and if it's listable
      const ownedItem = yourMapsItems.find((y) => y.id === mt.id);
      return {
        id: mt.id,
        label: mt.displayName,
        quality: mt.quality,
        thumbnail: mt.thumbnail,
        alias: mt.alias,
        activity: typeStats?.activity ?? 0,
        avgPrice: typeStats?.avgPrice ?? null,
        meetsListingRequirement: ownedItem?.meetsListingRequirement ?? false,
        lastGoalCount: mt.lastGoalCount,
        section: "all" as const,
        enabled: mt.enabledSlots,
        sellable: ownedItem?.meetsListingRequirement ?? false,
        goal: mt.goal,
        minRank: mt.minRank,
        minRankName: mt.minRankName,
      };
    });

  // Quality filter
  const matchesQuality = (item: SelectorItem): boolean => {
    if (qualityFilter === "all") return true;
    return item.quality === qualityFilter;
  };

  // Filter by search text
  const searchLower = search.toLowerCase();
  const matchesSearch = (item: SelectorItem): boolean => {
    if (!search) return true;
    if (item.label.toLowerCase().includes(searchLower)) return true;
    if (item.quality.toLowerCase().includes(searchLower)) return true;
    if (item.alias?.toLowerCase().includes(searchLower)) return true;
    return false;
  };

  const filteredYours = yourMapsItems
    .filter(matchesQuality)
    .filter(matchesSearch);

  // Sort "All Map Types" by selected criteria
  const sortItems = (items: SelectorItem[]): SelectorItem[] => {
    return [...items].sort((a, b) => {
      switch (sortBy) {
        case "activity":
          return b.activity - a.activity;
        case "name":
          return a.label.localeCompare(b.label);
        case "price":
          // Nulls last
          if (a.avgPrice == null && b.avgPrice == null) return 0;
          if (a.avgPrice == null) return 1;
          if (b.avgPrice == null) return -1;
          return b.avgPrice - a.avgPrice;
        default:
          return 0;
      }
    });
  };

  const filteredAll = sortItems(
    allItems.filter(matchesQuality).filter(matchesSearch)
  );
  const allFiltered = [...filteredYours, ...filteredAll];

  // Clamp highlight index to valid range
  const clampedHighlight = allFiltered.length > 0
    ? Math.max(0, Math.min(highlightIdx, allFiltered.length - 1))
    : -1;

  // Select a map type: unsubscribe old, subscribe new, close dropdown
  const handleSelect = (id: number) => {
    if (selectedMapTypeId.value) {
      wsSend({
        type: "unsubscribe_order_book",
        payload: { mapTypeId: selectedMapTypeId.value },
      });
    }

    selectedMapTypeId.value = id;

    wsSend({
      type: "subscribe_order_book",
      payload: { mapTypeId: id },
    });

    setOpen(false);
    setSearch("");
    setHighlightIdx(0);
  };

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || clampedHighlight < 0) return;
    const list = listRef.current;
    if (!list) return;
    const items = list.querySelectorAll(".map-selector-item");
    const item = items[clampedHighlight] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [clampedHighlight, open]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, allFiltered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && allFiltered.length > 0 && clampedHighlight >= 0) {
      e.preventDefault();
      handleSelect(allFiltered[clampedHighlight].id);
    }
  };

  // Currently selected map type for trigger display
  const selectedType = types.find((mt) => mt.id === selectedMapTypeId.value);

  if (types.length === 0 && yourMapsItems.length === 0) {
    return (
      <div class="map-selector">
        <p class="empty">
          No map types available yet. An admin must enable map types in the Moderation tab.
        </p>
      </div>
    );
  }

  const favIds = favouriteMapTypeIds.value;
  const subIds = subscribedMapTypeIds.value;

  const toggleFav = (e: MouseEvent, mapTypeId: number) => {
    e.stopPropagation();
    if (favIds.includes(mapTypeId)) {
      wsSend({ type: "remove_favourite", payload: { mapTypeId } });
    } else {
      wsSend({ type: "add_favourite", payload: { mapTypeId } });
    }
  };

  const toggleSub = (e: MouseEvent, mapTypeId: number) => {
    e.stopPropagation();
    if (subIds.includes(mapTypeId)) {
      wsSend({ type: "unsubscribe_map_type", payload: { mapTypeId } });
    } else {
      wsSend({ type: "subscribe_map_type", payload: { mapTypeId } });
    }
  };

  const isRankRestricted = (item: SelectorItem): boolean => {
    if (item.minRank == null) return false;
    const rank = playerTitleId.value;
    return rank == null || rank < item.minRank;
  };

  const renderItem = (item: SelectorItem, globalIdx: number) => {
    const restricted = isRankRestricted(item);
    return (
    <div
      key={`${item.section}-${item.id}`}
      class={`map-selector-item${globalIdx === clampedHighlight ? " highlighted" : ""}${!item.enabled && item.section === "all" ? " disabled-type" : ""}${restricted ? " rank-restricted" : ""}`}
      onClick={() => !restricted && handleSelect(item.id)}
      onMouseEnter={() => setHighlightIdx(globalIdx)}
    >
      <span class="map-name">
        <span class="map-item-icons">
          <span
            class={`icon-toggle${favIds.includes(item.id) ? " active" : ""}`}
            onClick={(e: MouseEvent) => toggleFav(e, item.id)}
          >
            {favIds.includes(item.id) ? <IconStarFilled size={13} /> : <IconStar size={13} />}
            <span class="icon-tooltip">{favIds.includes(item.id) ? "Remove from favorites" : "Add to favorites"}</span>
          </span>
          <span
            class={`icon-toggle${subIds.includes(item.id) ? " active" : ""}`}
            onClick={(e: MouseEvent) => toggleSub(e, item.id)}
          >
            {subIds.includes(item.id) ? <IconBellFilled size={13} /> : <IconBell size={13} />}
            <span class="icon-tooltip">{subIds.includes(item.id) ? "Stop notifications" : "Get notified of new listings"}</span>
          </span>
        </span>
        {item.thumbnail && <img class="map-thumb-sm" src={item.thumbnail} alt="" />}
        <span class="map-name-text">
          <span class="map-name-label">
            {item.label}
            {item.goal === "item" && <span class="goal-icon" title="Item-goal map"><IconBoxes size={12} /></span>}
            {!item.enabled && isAdmin.value && <span class="goal-icon disabled-icon" title="Disabled">{"\u{1F6AB}"}</span>}
          </span>
          {item.alias && <span class="map-alias">{item.alias}</span>}
        </span>
      </span>
      <span class="item-right">
        {(item.avgPrice != null || (item.sellable && item.section === "all")) && (
          <span class="map-price-stack">
            {item.avgPrice != null && (
              <span class="map-avg-price">{item.avgPrice} SB</span>
            )}
            {item.sellable && item.section === "all" && (
              <span class="sellable-icon"><IconTag size={12} /></span>
            )}
          </span>
        )}
        <span class={`quality ${item.quality}`}>{item.quality}</span>
      </span>
      {restricted && (
        <div class="rank-restricted-overlay">
          <span>Requires {item.minRankName ?? "Unknown Rank"}</span>
        </div>
      )}
    </div>
  );
  };

  return (
    <div class="map-selector" ref={containerRef}>
      <button
        type="button"
        class="map-selector-trigger"
        onClick={() => setOpen(!open)}
      >
        {selectedType ? (
          <>
            <span class="trigger-icons">
              <span
                class={`icon-toggle${favIds.includes(selectedType.id) ? " active" : ""}`}
                onClick={(e: MouseEvent) => { e.stopPropagation(); toggleFav(e, selectedType.id); }}
              >
                {favIds.includes(selectedType.id) ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                <span class="icon-tooltip">{favIds.includes(selectedType.id) ? "Remove from favorites" : "Add to favorites"}</span>
              </span>
              <span
                class={`icon-toggle${subIds.includes(selectedType.id) ? " active" : ""}`}
                onClick={(e: MouseEvent) => { e.stopPropagation(); toggleSub(e, selectedType.id); }}
              >
                {subIds.includes(selectedType.id) ? <IconBellFilled size={14} /> : <IconBell size={14} />}
                <span class="icon-tooltip">{subIds.includes(selectedType.id) ? "Stop notifications" : "Get notified of new listings"}</span>
              </span>
            </span>
            {selectedType.thumbnail && (
              <img class="map-thumb" src={selectedType.thumbnail} alt="" />
            )}
            <span class="map-name">
              {selectedType.displayName}
              {selectedType.goal === "item" && <span class="goal-icon" title="Item-goal map"><IconBoxes size={12} /></span>}
            </span>
            <span class={`quality ${selectedType.quality}`}>{selectedType.quality}</span>
          </>
        ) : (
          <span class="placeholder">Search for map...</span>
        )}
        <span class="chevron">{open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}</span>
      </button>

      {open && (
        <div class="map-selector-dropdown">
          <div class="search-input-wrap">
            <input
              ref={searchRef}
              type="text"
              class="map-selector-search"
              placeholder="Search maps..."
              value={search}
              onInput={(e) => {
                setSearch((e.target as HTMLInputElement).value);
                setHighlightIdx(0);
              }}
              onKeyDown={handleKeyDown}
            />
            {search && (
              <button
                type="button"
                class="search-clear"
                onClick={() => { setSearch(""); setHighlightIdx(0); searchRef.current?.focus(); }}
              >
                <IconX size={14} />
              </button>
            )}
          </div>

          <div class="map-selector-toolbar">
            <div class="map-selector-pills">
              {(["all", "common", "rare"] as QualityFilter[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  class={`pill${qualityFilter === q ? " active" : ""}`}
                  onClick={() => { setQualityFilter(q); setHighlightIdx(0); }}
                >
                  {q === "all" ? "All" : q.charAt(0).toUpperCase() + q.slice(1)}
                </button>
              ))}
            </div>
            <div class="map-selector-pills">
              {(["activity", "name", "price"] as SortBy[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  class={`pill${sortBy === s ? " active" : ""}`}
                  onClick={() => { setSortBy(s); setHighlightIdx(0); }}
                >
                  {s === "activity" ? "Activity" : s === "name" ? "Name" : "Price"}
                </button>
              ))}
            </div>
          </div>

          <div class="map-selector-list" ref={listRef}>
            {filteredYours.length > 0 && (
              <>
                <div class="map-selector-section">Your Maps</div>
                {filteredYours.map((item, idx) => renderItem(item, idx))}
              </>
            )}

            {hasUnenrichedMaps && filteredYours.length === 0 && !search && (
              <div class="map-selector-detecting">Detecting your maps...</div>
            )}

            {filteredAll.length > 0 && (
              <>
                <div class="map-selector-section">All Map Types</div>
                {filteredAll.map((item, allIdx) =>
                  renderItem(item, filteredYours.length + allIdx)
                )}
              </>
            )}

            {allFiltered.length === 0 && (
              <div class="map-selector-empty">No matches found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
