import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import type { MapType } from "@mhcm/shared";
import {
  selectedMapTypeId,
  selectedMapMode,
  selectedMapInfo,
  allMapTypes,
  mapSelectorSearch,
  mapSelectorSort,
  mapOrderBook,
  mapFavourites,
  mapNotifications,
} from "../../signals/maps.js";
import { playerTitleId } from "../../signals/game-state.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import {
  IconChevronDown,
  IconChevronUp,
  IconStar,
  IconStarFilled,
  IconBell,
  IconBellFilled,
  IconX,
  IconBoxes,
} from "../common/Icons.js";

export function MapSelector() {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const search = mapSelectorSearch.value;
  const sort = mapSelectorSort.value;
  const mode = selectedMapMode.value;
  const maps = allMapTypes.value;
  const favs = mapFavourites.value;
  const notifs = mapNotifications.value;

  // Filter + sort maps
  const filteredMaps = useMemo(() => {
    let result = maps.filter((m) => mode === "unopened" ? m.enabledUnopened : m.enabledComplete);

    // Mode-based quality filtering (spec Q16, Q18)
    if (mode === "unopened") {
      // Unopened: only common maps (scrolls always produce common)
      result = result.filter((m) => m.quality === "common");
    }
    // Complete mode shows all (common + rare)

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((m) => m.displayName.toLowerCase().includes(q));
    }

    // Sort
    if (sort === "name") {
      result = [...result].sort((a, b) => a.displayName.localeCompare(b.displayName));
    } else if (sort === "price") {
      // Price sort not implemented until we have per-map stats; fall back to name
      result = [...result].sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    // "activity" is the default server order

    return result;
  }, [maps, search, sort, mode]);

  // Select a map
  const handleSelect = (map: MapType) => {
    if (selectedMapTypeId.value != null) {
      wsSend({
        type: "unsubscribe_map_order_book",
        payload: { mapTypeId: selectedMapTypeId.value, mode: selectedMapMode.value },
      });
    }
    selectedMapTypeId.value = map.id;
    selectedMapInfo.value = {
      id: map.id,
      display_name: map.displayName,
      thumbnail: map.thumbnail,
      quality: map.quality,
      goal: map.goal,
    };
    mapOrderBook.value = null;
    wsSend({ type: "subscribe_map_order_book", payload: { mapTypeId: map.id, mode } });
    setOpen(false);
    mapSelectorSearch.value = "";
  };

  // Toggle favourite
  const toggleFav = (e: MouseEvent, mapTypeId: number) => {
    e.stopPropagation();
    wsSend({ type: "toggle_map_favourite", payload: { mapTypeId, mode } });
  };

  // Toggle notification
  const toggleNotif = (e: MouseEvent, mapTypeId: number) => {
    e.stopPropagation();
    wsSend({ type: "toggle_map_notification", payload: { mapTypeId, mode } });
  };

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Auto-focus search when opened
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, filteredMaps.length - 1));
      scrollHighlightedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
      scrollHighlightedIntoView();
    } else if (e.key === "Enter" && filteredMaps[highlightIdx]) {
      e.preventDefault();
      handleSelect(filteredMaps[highlightIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const scrollHighlightedIntoView = () => {
    setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const items = list.querySelectorAll(".map-selector-item");
      const highlighted = items[highlightIdx];
      if (highlighted) {
        highlighted.scrollIntoView({ block: "nearest" });
      }
    }, 0);
  };

  const handleSearchInput = (value: string) => {
    mapSelectorSearch.value = value;
    setHighlightIdx(0);
  };

  // Trigger first load when selector opens
  useEffect(() => {
    if (open && maps.length === 0) {
      wsSend({ type: "get_map_types" });
    }
  }, [open, maps.length]);

  const selectedMap = selectedMapInfo.value;

  return (
    <div class="map-selector" ref={containerRef}>
      <button
        type="button"
        class="map-selector-trigger"
        onClick={() => setOpen(!open)}
      >
        {selectedMap ? (
          <>
            <span class="trigger-icons">
              <span
                class={`icon-toggle${favs.has(selectedMap.id) ? " active" : ""}`}
                onClick={(e: MouseEvent) => { e.stopPropagation(); toggleFav(e, selectedMap.id); }}
              >
                {favs.has(selectedMap.id) ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                <span class="icon-tooltip">{favs.has(selectedMap.id) ? "Remove from favorites" : "Add to favorites"}</span>
              </span>
              <span
                class={`icon-toggle${notifs.has(`${selectedMap.id}:${mode}`) ? " active" : ""}`}
                onClick={(e: MouseEvent) => { e.stopPropagation(); toggleNotif(e, selectedMap.id); }}
              >
                {notifs.has(`${selectedMap.id}:${mode}`) ? <IconBellFilled size={14} /> : <IconBell size={14} />}
                <span class="icon-tooltip">{notifs.has(`${selectedMap.id}:${mode}`) ? "Disable notifications" : "Enable notifications"}</span>
              </span>
            </span>
            {selectedMap.thumbnail && (
              <img class="mouse-thumb-sm" src={selectedMap.thumbnail} alt="" />
            )}
            <span class="mouse-name">
              {selectedMap.display_name}
              {selectedMap.goal === "item" && <span class="goal-icon" title="Item-goal map"><IconBoxes size={12} /></span>}
            </span>
            {selectedMap.quality === "rare" && (
              <span class="badge badge-rare selector-badge">RARE</span>
            )}
          </>
        ) : (
          <span class="placeholder">Select a Map...</span>
        )}
        <span class="chevron">
          {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </span>
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
              onInput={(e) => handleSearchInput((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
            />
            {search && (
              <button
                type="button"
                class="search-clear"
                onClick={() => {
                  handleSearchInput("");
                  searchRef.current?.focus();
                }}
              >
                <IconX size={14} />
              </button>
            )}
          </div>

          <div class="map-selector-toolbar">
            <div class="map-selector-pills">
              {(["activity", "name", "price"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  class={`pill${sort === s ? " active" : ""}`}
                  onClick={() => {
                    mapSelectorSort.value = s;
                    setHighlightIdx(0);
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div class="map-selector-list" ref={listRef}>
            {filteredMaps.map((map, idx) => {
              const restricted = map.minRank != null && (playerTitleId.value == null || playerTitleId.value < map.minRank);
              return (
              <div
                key={map.id}
                class={`map-selector-item${idx === highlightIdx ? " highlighted" : ""}${restricted ? " rank-restricted" : ""}`}
                onClick={() => !restricted && handleSelect(map)}
                onMouseEnter={() => setHighlightIdx(idx)}
              >
                <span class="map-name">
                  <span class="map-item-icons">
                    <span
                      class={`icon-toggle${favs.has(map.id) ? " active" : ""}`}
                      onClick={(e: MouseEvent) => toggleFav(e, map.id)}
                    >
                      {favs.has(map.id) ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                    </span>
                    <span
                      class={`icon-toggle${notifs.has(`${map.id}:${mode}`) ? " active" : ""}`}
                      onClick={(e: MouseEvent) => toggleNotif(e, map.id)}
                    >
                      {notifs.has(`${map.id}:${mode}`) ? <IconBellFilled size={13} /> : <IconBell size={13} />}
                    </span>
                  </span>
                  {map.thumbnail && (
                    <img class="mouse-thumb-sm" src={map.thumbnail} alt="" />
                  )}
                  <span>
                    {map.displayName}
                    {map.goal === "item" && <span class="goal-icon" title="Item-goal map"><IconBoxes size={12} /></span>}
                  </span>
                </span>
                {restricted && (
                  <div class="rank-restricted-overlay">
                    <span>Requires {map.minRankName ?? "Unknown Rank"}</span>
                  </div>
                )}
              </div>
              );
            })}
            {filteredMaps.length === 0 && (
              <div class="map-selector-empty">
                {maps.length === 0 ? "Loading maps..." : "No maps found"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
