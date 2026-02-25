import { useState, useRef, useEffect } from "preact/hooks";
import { selectedMapTypeId, tierFilter, rtFilter, mapTypes } from "../../signals/slots.js";
import type { RtFilterMode } from "../../signals/slots.js";
import { MapTypeSelector } from "./SlotMapTypeSelector.js";
import { OrderBook } from "./SlotOrderBook.js";
import { CreateOrder } from "./SlotCreateOrder.js";
import { SlotsHomeView, SlotBackButton } from "./SlotsHomeView.js";
import { IconFilter, IconChevronDown } from "../common/Icons.js";
import type { OrderTier } from "@mhcm/shared";

const FILTER_TIERS = ["S", "A", "B"] as const;

const TIER_TOOLTIPS: Record<string, string> = {
  S: "100% attraction & catch rate",
  A: "100% attraction, imperfect catch",
  B: "Uncertain attraction or catch",
};

function TierFilterDropdown() {
  const filter = tierFilter.value;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleTier = (tier: OrderTier) => {
    const next = new Set(filter);
    if (next.has(tier)) next.delete(tier);
    else next.add(tier);
    tierFilter.value = next;
  };

  const label =
    filter.size === 0
      ? "All"
      : FILTER_TIERS.filter((t) => filter.has(t)).join(", ");

  return (
    <div class="filter-dropdown" ref={ref}>
      <span class="filter-dropdown-label">
        {mapTypes.value.find((mt) => mt.id === selectedMapTypeId.value)?.goal === "item" ? "Last item" : "Last mouse"}:
      </span>
      <button
        type="button"
        class={`filter-dropdown-trigger${open ? " open" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <IconFilter size={12} />
        <span class="filter-dropdown-value">{label}</span>
        <IconChevronDown size={12} />
      </button>
      {open && (
        <div class="filter-dropdown-menu">
          <label class="filter-dropdown-option" onClick={() => { tierFilter.value = new Set(); }}>
            <input type="checkbox" checked={filter.size === 0} readOnly />
            <span>All tiers</span>
          </label>
          {FILTER_TIERS.map((tier) => (
            <label key={tier} class="filter-dropdown-option" onClick={(e) => { e.preventDefault(); toggleTier(tier); }}>
              <input type="checkbox" checked={filter.has(tier)} readOnly />
              <span class={`tier-badge-inline tier-${tier.toLowerCase()}`}>{tier}</span>
              <span>{TIER_TOOLTIPS[tier]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const RT_MODES: { value: RtFilterMode; label: string; title: string }[] = [
  { value: "off", label: "Off", title: "Hide RT orders" },
  { value: "only", label: "RT only", title: "Show only RT orders" },
  { value: "all", label: "All", title: "Show all orders" },
];

function RtFilterDropdown() {
  const mapTypeId = selectedMapTypeId.value;
  const selectedType = mapTypes.value.find((mt) => mt.id === mapTypeId);
  if (!selectedType?.supportsRt) return null;

  const mode = rtFilter.value;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentLabel = RT_MODES.find((m) => m.value === mode)?.label ?? "Off";

  return (
    <div class="filter-dropdown" ref={ref}>
      <span class="filter-dropdown-label">RT:</span>
      <button
        type="button"
        class={`filter-dropdown-trigger${open ? " open" : ""}${mode === "only" ? " rt-active" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <IconFilter size={12} />
        <span class="filter-dropdown-value">{currentLabel}</span>
        <IconChevronDown size={12} />
      </button>
      {open && (
        <div class="filter-dropdown-menu">
          {RT_MODES.map((m) => (
            <label
              key={m.value}
              class={`filter-dropdown-option${mode === m.value ? " active" : ""}`}
              onClick={() => { rtFilter.value = m.value; setOpen(false); }}
            >
              <span>{m.label}</span>
              <span class="filter-dropdown-hint">{m.title}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SlotView() {
  return (
    <div class="marketplace-view">
      <MapTypeSelector />
      {selectedMapTypeId.value ? (
        <>
          <div class="filter-bar">
            <TierFilterDropdown />
            <RtFilterDropdown />
          </div>
          <OrderBook />
          <CreateOrder />
          <SlotBackButton />
        </>
      ) : (
        <SlotsHomeView />
      )}
    </div>
  );
}
