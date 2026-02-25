import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import type { ItemType } from "@mhcm/shared";
import {
  selectedItemTypeId,
  selectedItemInfo,
  allItemTypes,
  selectedClassifications,
  itemSelectorSearch,
  itemSelectorSort,
  itemOrderBook,
  itemFavourites,
  itemNotifications,
} from "../../signals/items.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import {
  IconChevronDown,
  IconChevronUp,
  IconStar,
  IconStarFilled,
  IconBell,
  IconBellFilled,
  IconX,
  IconStore,
} from "../common/Icons.js";

export function ItemSelector() {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const search = itemSelectorSearch.value;
  const sort = itemSelectorSort.value;
  const classFilter = selectedClassifications.value;
  const items = allItemTypes.value;
  const favs = itemFavourites.value;
  const notifs = itemNotifications.value;

  // Filter + sort items
  const filteredItems = useMemo(() => {
    let result = items;

    // Classification filter
    if (classFilter.size > 0) {
      result = result.filter((it) => classFilter.has(it.classification));
    }

    // Search filter (name + alias)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          (it.alias && it.alias.toLowerCase().includes(q))
      );
    }

    // Sort
    if (sort === "name") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "price") {
      // Price sort not implemented until we have per-item stats; fall back to name
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    // "activity" is the default server order

    return result;
  }, [items, classFilter, search, sort]);

  // Select an item
  const handleSelect = (item: ItemType) => {
    if (selectedItemTypeId.value) {
      wsSend({ type: "unsubscribe_item_order_book", payload: { itemTypeId: selectedItemTypeId.value } });
    }
    selectedItemTypeId.value = item.id;
    selectedItemInfo.value = { id: item.id, type: item.type, name: item.name, thumbnail: item.thumbnail };
    itemOrderBook.value = null;
    wsSend({ type: "subscribe_item_order_book", payload: { itemTypeId: item.id } });
    setOpen(false);
    itemSelectorSearch.value = "";
  };

  // Toggle favourite
  const toggleFav = (e: MouseEvent, itemTypeId: number) => {
    e.stopPropagation();
    wsSend({ type: "toggle_item_favourite", payload: { itemTypeId } });
  };

  // Toggle notification
  const toggleNotif = (e: MouseEvent, itemTypeId: number) => {
    e.stopPropagation();
    wsSend({ type: "toggle_item_notification", payload: { itemTypeId } });
  };

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        itemSelectorSearch.value = "";
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || highlightIdx < 0) return;
    const list = listRef.current;
    if (!list) return;
    const elems = list.querySelectorAll(".map-selector-item");
    const el = elems[highlightIdx] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

  const handleOpen = () => {
    if (!open) {
      setHighlightIdx(0);
      // Request item types if not loaded yet
      if (items.length === 0) {
        wsSend({ type: "get_item_types" });
      }
    }
    setOpen(!open);
  };

  const handleSearchInput = (value: string) => {
    itemSelectorSearch.value = value;
    setHighlightIdx(0);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      itemSelectorSearch.value = "";
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filteredItems.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && filteredItems.length > 0 && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(filteredItems[highlightIdx]);
    }
  };

  return (
    <div class="map-selector" ref={containerRef}>
      <button
        type="button"
        class="map-selector-trigger"
        onClick={handleOpen}
      >
        {selectedItemInfo.value ? (
          <>
            <span class="trigger-icons">
              <span
                class={`icon-toggle${favs.has(selectedItemInfo.value.id) ? " active" : ""}`}
                onClick={(e: MouseEvent) => { e.stopPropagation(); toggleFav(e, selectedItemInfo.value!.id); }}
              >
                {favs.has(selectedItemInfo.value.id) ? <IconStarFilled size={14} /> : <IconStar size={14} />}
              </span>
            </span>
            {selectedItemInfo.value.thumbnail && (
              <img class="mouse-thumb-sm" src={selectedItemInfo.value.thumbnail} alt="" />
            )}
            <span class="map-name">{selectedItemInfo.value.name}</span>
          </>
        ) : (
          <span class="placeholder">Search for item...</span>
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
              placeholder="Search items..."
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
                  onClick={() => { itemSelectorSort.value = s; setHighlightIdx(0); }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div
            class="map-selector-list"
            ref={listRef}
          >
            {filteredItems.map((item, idx) => (
              <div
                key={item.id}
                class={`map-selector-item${idx === highlightIdx ? " highlighted" : ""}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightIdx(idx)}
              >
                <span class="map-name">
                  <span class="map-item-icons">
                    <span
                      class={`icon-toggle${favs.has(item.id) ? " active" : ""}`}
                      onClick={(e: MouseEvent) => toggleFav(e, item.id)}
                    >
                      {favs.has(item.id) ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                    </span>
                    <span
                      class={`icon-toggle${notifs.has(item.id) ? " active" : ""}`}
                      onClick={(e: MouseEvent) => toggleNotif(e, item.id)}
                    >
                      {notifs.has(item.id) ? <IconBellFilled size={13} /> : <IconBell size={13} />}
                    </span>
                  </span>
                  {item.thumbnail ? (
                    <img class="mouse-thumb-sm" src={item.thumbnail} alt="" />
                  ) : (
                    <IconStore size={16} />
                  )}
                  <span>{item.name}</span>
                </span>
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div class="map-selector-empty">
                {items.length === 0 ? "Loading items..." : "No items found"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
