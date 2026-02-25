import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import type { MouseType } from "@mhcm/shared";
import {
  selectedMouseTypeId,
  selectedMouseGroupId,
  selectedMouseInfo,
  snipingOrderBook,
  mouseListPage,
  snipingFavourites,
} from "../../signals/sniping.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconChevronDown, IconChevronUp, IconStar, IconStarFilled, IconX } from "../common/Icons.js";

const PAGE_SIZE = 100;

export function SnipingMouseSelector() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MouseType[]>([]);
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
      ? favs.some((f) => f.mouseGroupId === id)
      : favs.some((f) => f.mouseTypeId === id);
  const page = mouseListPage.value;

  // Load a page of mice
  const loadPage = useCallback(
    (offset: number, searchStr?: string) => {
      setLoading(true);
      offsetRef.current = offset + PAGE_SIZE;
      wsSend({
        type: "list_mice",
        payload: { offset, limit: PAGE_SIZE, search: searchStr || undefined },
      });
    },
    []
  );

  // Process incoming mouse_list responses
  useEffect(() => {
    if (!page) return;
    if (skipCountRef.current > 0) {
      skipCountRef.current--;
      return;
    }
    setItems((prev) => [...prev, ...page.mice]);
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

  // Select a mouse or group: unsubscribe old, subscribe new
  const handleSelect = (item: MouseType) => {
    if (selectedMouseTypeId.value) {
      wsSend({ type: "unsubscribe_sniping_order_book", payload: { mouseTypeId: selectedMouseTypeId.value } });
    } else if (selectedMouseGroupId.value) {
      wsSend({ type: "unsubscribe_sniping_order_book", payload: { mouseGroupId: selectedMouseGroupId.value } });
    }

    if (item.isGroup) {
      selectedMouseTypeId.value = null;
      selectedMouseGroupId.value = item.id;
      selectedMouseInfo.value = { id: item.id, name: item.name, thumbnail: item.thumbnail ?? null, isGroup: true };
      snipingOrderBook.value = null;
      wsSend({ type: "subscribe_sniping_order_book", payload: { mouseGroupId: item.id } });
    } else {
      selectedMouseTypeId.value = item.id;
      selectedMouseGroupId.value = null;
      selectedMouseInfo.value = { id: item.id, name: item.name, thumbnail: item.thumbnail };
      snipingOrderBook.value = null;
      wsSend({ type: "subscribe_sniping_order_book", payload: { mouseTypeId: item.id } });
    }

    setOpen(false);
    setSearch("");
  };

  // Toggle favourite
  const toggleFav = (e: MouseEvent, id: number, isGroup?: boolean) => {
    e.stopPropagation();
    const goalType = isGroup ? "mouse_group" : "mouse";
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
        {selectedMouseInfo.value ? (
          <>
            <span class="trigger-icons">
              <span
                class={`icon-toggle${isFav(selectedMouseInfo.value.id, selectedMouseInfo.value.isGroup) ? " active" : ""}`}
                onClick={(e: MouseEvent) => { e.stopPropagation(); toggleFav(e, selectedMouseInfo.value!.id, selectedMouseInfo.value!.isGroup); }}
              >
                {isFav(selectedMouseInfo.value.id, selectedMouseInfo.value.isGroup) ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                <span class="icon-tooltip">{isFav(selectedMouseInfo.value.id, selectedMouseInfo.value.isGroup) ? "Remove from favorites" : "Add to favorites"}</span>
              </span>
            </span>
            {selectedMouseInfo.value.thumbnail && (
              <img class="mouse-thumb-sm" src={selectedMouseInfo.value.thumbnail} alt="" />
            )}
            <span class="mouse-name">{selectedMouseInfo.value.name}</span>
            {selectedMouseInfo.value.isGroup && (
              <span class="badge badge-group selector-badge">Group</span>
            )}
          </>
        ) : (
          <span class="placeholder">Select a mouse...</span>
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
              placeholder="Search mice..."
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
            {items.map((mouse, idx) => (
              <div
                key={mouse.isGroup ? `g${mouse.id}` : mouse.id}
                class={`sniping-selector-item${idx === highlightIdx ? " highlighted" : ""}`}
                onClick={() => handleSelect(mouse)}
                onMouseEnter={() => setHighlightIdx(idx)}
              >
                <span class="map-item-icons">
                  <span
                    class={`icon-toggle${isFav(mouse.id, mouse.isGroup) ? " active" : ""}`}
                    onClick={(e: MouseEvent) => toggleFav(e, mouse.id, mouse.isGroup)}
                  >
                    {isFav(mouse.id, mouse.isGroup) ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                    <span class="icon-tooltip">{isFav(mouse.id, mouse.isGroup) ? "Remove from favorites" : "Add to favorites"}</span>
                  </span>
                </span>
                {mouse.thumbnail && (
                  <img class="mouse-thumb-sm" src={mouse.thumbnail} alt="" />
                )}
                <span class="mouse-name">{mouse.name}</span>
                {mouse.isGroup && (
                  <span class="badge badge-group selector-badge">Group</span>
                )}
              </div>
            ))}
            {loading && (
              <div class="sniping-selector-empty">Loading...</div>
            )}
            {!loading && items.length === 0 && (
              <div class="sniping-selector-empty">No mice found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
