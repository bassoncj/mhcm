import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import type { ItemType } from "@mhcm/shared";
import {
  selectedItemTypeId,
  selectedItemGroupId,
  selectedItemInfo,
  snipingOrderBook,
  itemListPage,
  snipingFavourites,
} from "../../signals/sniping.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconChevronDown, IconChevronUp, IconStar, IconStarFilled, IconX } from "../common/Icons.js";

const PAGE_SIZE = 100;

export function SnipingItemSelector() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ItemType[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipCountRef = useRef(0);

  const favs = snipingFavourites.value;
  const isFav = (id: number, isGroup?: boolean): boolean =>
    isGroup
      ? favs.some((f) => f.itemGroupId === id)
      : favs.some((f) => f.itemTypeId === id);
  const page = itemListPage.value;

  // Load a page of items
  const loadPage = useCallback(
    (offset: number, searchStr?: string) => {
      setLoading(true);
      offsetRef.current = offset + PAGE_SIZE;
      wsSend({
        type: "list_items",
        payload: { offset, limit: PAGE_SIZE, search: searchStr || undefined },
      });
    },
    []
  );

  // Process incoming item_list responses
  useEffect(() => {
    if (!page) return;
    if (skipCountRef.current > 0) {
      skipCountRef.current--;
      return;
    }
    setItems((prev) => [...prev, ...page.items]);
    setHasMore(page.hasMore);
    setLoading(false);
  }, [page]);

  // Reset list state and discard any in-flight responses
  const resetList = useCallback(() => {
    if (loading) skipCountRef.current++;
    setItems([]);
    setHasMore(true);
    offsetRef.current = 0;
  }, [loading]);

  // Open dropdown: reset list and load first page
  const handleOpen = () => {
    if (!open) {
      resetList();
      setSearch("");
      setHighlightIdx(0);
      loadPage(0);
    }
    setOpen(!open);
  };

  // Debounced search
  const handleSearchInput = (value: string) => {
    setSearch(value);
    setHighlightIdx(0);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      resetList();
      loadPage(0, value.trim() || undefined);
    }, 300);
  };

  // Infinite scroll
  const handleScroll = () => {
    const list = listRef.current;
    if (!list || loading || !hasMore) return;

    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 50) {
      loadPage(offsetRef.current, search.trim() || undefined);
    }
  };

  // Select an item or item group: unsubscribe old, subscribe new
  const handleSelect = (item: ItemType) => {
    if (selectedItemTypeId.value) {
      wsSend({ type: "unsubscribe_sniping_order_book", payload: { itemTypeId: selectedItemTypeId.value } });
    } else if (selectedItemGroupId.value) {
      wsSend({ type: "unsubscribe_sniping_order_book", payload: { itemGroupId: selectedItemGroupId.value } });
    }

    if (item.isGroup) {
      selectedItemTypeId.value = null;
      selectedItemGroupId.value = item.id;
      selectedItemInfo.value = { id: item.id, name: item.name, thumbnail: item.thumbnail ?? null, isGroup: true };
      snipingOrderBook.value = null;
      wsSend({ type: "subscribe_sniping_order_book", payload: { itemGroupId: item.id } });
    } else {
      selectedItemTypeId.value = item.id;
      selectedItemGroupId.value = null;
      selectedItemInfo.value = { id: item.id, name: item.name, thumbnail: item.thumbnail ?? null };
      snipingOrderBook.value = null;
      wsSend({ type: "subscribe_sniping_order_book", payload: { itemTypeId: item.id } });
    }

    setOpen(false);
    setSearch("");
  };

  // Toggle favourite
  const toggleFav = (e: MouseEvent, id: number, isGroup?: boolean) => {
    e.stopPropagation();
    const goalType = isGroup ? "item_group" : "item";
    if (isFav(id, isGroup)) {
      wsSend({ type: "remove_sniping_favourite", payload: { goalType, goalId: id } });
    } else {
      wsSend({ type: "add_sniping_favourite", payload: { goalType, goalId: id } });
    }
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
    const elems = list.querySelectorAll(".sniping-selector-item");
    const el = elems[highlightIdx] as HTMLElement | undefined;
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx, open]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, items.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && items.length > 0 && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(items[highlightIdx]);
    }
  };

  return (
    <div class="sniping-selector" ref={containerRef}>
      <button
        type="button"
        class="sniping-selector-trigger"
        onClick={handleOpen}
      >
        {selectedItemInfo.value ? (
          <>
            <span class="trigger-icons">
              <span
                class={`icon-toggle${isFav(selectedItemInfo.value.id, selectedItemInfo.value.isGroup) ? " active" : ""}`}
                onClick={(e: MouseEvent) => { e.stopPropagation(); toggleFav(e, selectedItemInfo.value!.id, selectedItemInfo.value!.isGroup); }}
              >
                {isFav(selectedItemInfo.value.id, selectedItemInfo.value.isGroup) ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                <span class="icon-tooltip">{isFav(selectedItemInfo.value.id, selectedItemInfo.value.isGroup) ? "Remove from favorites" : "Add to favorites"}</span>
              </span>
            </span>
            {selectedItemInfo.value.thumbnail && (
              <img class="mouse-thumb-sm" src={selectedItemInfo.value.thumbnail} alt="" />
            )}
            <span class="mouse-name">{selectedItemInfo.value.name}</span>
            {selectedItemInfo.value.isGroup && (
              <span class="badge badge-group selector-badge">Group</span>
            )}
          </>
        ) : (
          <span class="placeholder">Select an item...</span>
        )}
        <span class="chevron">
          {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div class="sniping-selector-dropdown">
          <div class="search-input-wrap">
            <input
              ref={searchRef}
              type="text"
              class="sniping-selector-search"
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

          <div
            class="sniping-selector-list"
            ref={listRef}
            onScroll={handleScroll}
          >
            {items.map((item, idx) => (
              <div
                key={item.isGroup ? `ig${item.id}` : `i${item.id}`}
                class={`sniping-selector-item${idx === highlightIdx ? " highlighted" : ""}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightIdx(idx)}
              >
                <span class="map-item-icons">
                  <span
                    class={`icon-toggle${isFav(item.id, item.isGroup) ? " active" : ""}`}
                    onClick={(e: MouseEvent) => toggleFav(e, item.id, item.isGroup)}
                  >
                    {isFav(item.id, item.isGroup) ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                    <span class="icon-tooltip">{isFav(item.id, item.isGroup) ? "Remove from favorites" : "Add to favorites"}</span>
                  </span>
                </span>
                {item.thumbnail && (
                  <img class="mouse-thumb-sm" src={item.thumbnail} alt="" />
                )}
                <span class="mouse-name">{item.name}</span>
                {item.isGroup && (
                  <span class="badge badge-group selector-badge">Group</span>
                )}
              </div>
            ))}
            {loading && (
              <div class="sniping-selector-empty">Loading...</div>
            )}
            {!loading && items.length === 0 && (
              <div class="sniping-selector-empty">No items found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
