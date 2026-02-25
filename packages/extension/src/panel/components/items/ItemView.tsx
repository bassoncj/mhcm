import { useState, useRef, useEffect } from "preact/hooks";
import { selectedItemTypeId, itemClassifications, selectedClassifications } from "../../signals/items.js";
import { ItemSelector } from "./ItemSelector.js";
import { ItemOrderBook } from "./ItemOrderBook.js";
import { ItemCreateOrder } from "./ItemCreateOrder.js";
import { ItemsHomeView, ItemBackButton } from "./ItemsHomeView.js";
import { IconFilter } from "../common/Icons.js";

function formatClassification(c: string): string {
  return c
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function ItemClassificationFilter() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const classFilter = selectedClassifications.value;
  const classifications = itemClassifications.value;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (c: string) => {
    const next = new Set(classFilter);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    selectedClassifications.value = next;
  };

  return (
    <div class="item-filter-wrap" ref={ref}>
      <button
        type="button"
        class={`wizard-btn${classFilter.size > 0 ? " active" : ""}`}
        onClick={() => setOpen(!open)}
        title="Filter by classification"
      >
        <IconFilter size={14} />
        {classFilter.size > 0 && (
          <span class="item-filter-badge">{classFilter.size}</span>
        )}
      </button>
      {open && classifications.length > 0 && (
        <div class="item-classification-dropdown">
          {classifications.map((c) => (
            <label key={c} class="item-classification-option">
              <input
                type="checkbox"
                checked={classFilter.has(c)}
                onChange={() => toggle(c)}
              />
              {formatClassification(c)}
            </label>
          ))}
          {classFilter.size > 0 && (
            <button
              type="button"
              class="item-classification-clear"
              onClick={() => { selectedClassifications.value = new Set(); }}
            >
              Clear All
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ItemView() {
  return (
    <div class="marketplace-view">
      <div class="selector-row">
        <ItemSelector />
        <ItemClassificationFilter />
      </div>
      {selectedItemTypeId.value ? (
        <>
          <ItemOrderBook />
          <ItemCreateOrder />
          <ItemBackButton />
        </>
      ) : (
        <ItemsHomeView />
      )}
    </div>
  );
}
