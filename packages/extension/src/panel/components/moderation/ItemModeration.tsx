import { useState, useEffect } from "preact/hooks";
import type { ItemMapTier, ItemType } from "@mhcm/shared";
import {
  modItems,
  modItemsTotal,
  selectedItemId,
  selectedItemMapTiers,
  modItemClassifications,
  selectedItemRiskLocations,
  environmentSearchResults,
  selectedItemGroupId,
  selectedItemGroupMembers,
} from "../../signals/moderation.js";
import { itemSearchResults } from "../../signals/sniping.js";
import { mapTypes } from "../../signals/slots.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconX, IconFilter, IconEye, IconEyeOff } from "../common/Icons.js";
import { PaginationBar } from "../common/PaginationBar.js";

type ItemTier = "S" | "A" | "B";
const TIERS: ItemTier[] = ["S", "A", "B"];
const PAGE_SIZE = 20;

export function ItemModeration() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [classSearch, setClassSearch] = useState("");
  const [selectedClassifications, setSelectedClassifications] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [tierFilter, setTierFilter] = useState<ItemTier | "unset" | "all">("all");
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  const [groupsOnly, setGroupsOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Load items on mount and when search/page/classification/showHidden/tier/group filters change
  useEffect(() => {
    const classArr = selectedClassifications.size > 0 ? Array.from(selectedClassifications) : undefined;
    wsSend({
      type: "mod_list_items",
      payload: {
        search: search || undefined,
        classifications: classArr,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        showHidden: showHidden || undefined,
        tierFilter: tierFilter === "all" ? undefined : tierFilter,
        groupsOnly: groupsOnly || undefined,
        includeArchivedGroups: showArchivedGroups || undefined,
      },
    });
  }, [search, page, selectedClassifications, showHidden, tierFilter, showArchivedGroups, groupsOnly]);

  // Fetch item map tiers + risk locations when expanding an item (not a group)
  useEffect(() => {
    if (expandedId !== null) {
      selectedItemId.value = expandedId;
      wsSend({ type: "mod_get_item_map_tiers", payload: { itemId: expandedId } });
      wsSend({ type: "mod_get_item_risk_locations", payload: { itemTypeId: expandedId } });
    } else {
      selectedItemId.value = null;
      selectedItemRiskLocations.value = [];
    }
  }, [expandedId]);

  // Fetch group members when expanding a group
  useEffect(() => {
    if (expandedGroupId !== null) {
      selectedItemGroupId.value = expandedGroupId;
      wsSend({ type: "mod_get_item_group_members", payload: { groupId: expandedGroupId } });
    } else {
      selectedItemGroupId.value = null;
    }
  }, [expandedGroupId]);

  const items = modItems.value;
  const total = modItemsTotal.value;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const classifications = modItemClassifications.value;

  const handleExpandItem = (itemId: number) => {
    setExpandedGroupId(null);
    setExpandedId(expandedId === itemId ? null : itemId);
  };

  const handleExpandGroup = (groupId: number) => {
    setExpandedId(null);
    setExpandedGroupId(expandedGroupId === groupId ? null : groupId);
  };

  const handleToggle = (itemTypeId: number, enabled: boolean) => {
    wsSend({ type: "mod_toggle_item", payload: { itemTypeId, enabled } });
  };

  const handleToggleGroup = (groupId: number, enabled: boolean) => {
    wsSend({ type: "mod_toggle_item_group", payload: { groupId, enabled } });
  };

  const handleSetGlobalTier = (itemId: number, tier: ItemTier, currentTier: ItemTier | null) => {
    wsSend({ type: "mod_set_item_tier", payload: { itemId, tier: tier === currentTier ? null : tier } });
  };

  const handleSaveAlias = (itemTypeId: number, rawInput: string) => {
    wsSend({ type: "mod_set_item_alias", payload: { itemTypeId, alias: rawInput.trim() || null } });
  };

  const handleSaveThumbnail = (itemTypeId: number, rawInput: string) => {
    wsSend({ type: "mod_set_item_thumbnail", payload: { itemTypeId, thumbnail: rawInput.trim() || null } });
  };

  const handleAddMapTier = (itemId: number, mapTypeId: number, tier: ItemTier) => {
    wsSend({ type: "mod_set_item_map_tier", payload: { itemId, mapTypeId, tier } });
  };

  const handleDeleteMapTier = (itemId: number, mapTypeId: number) => {
    wsSend({ type: "mod_delete_item_map_tier", payload: { itemId, mapTypeId } });
  };

  const handleArchiveGroup = (groupId: number) => {
    wsSend({ type: "mod_archive_item_group", payload: { groupId } });
    setExpandedGroupId(null);
  };

  const handleDeleteGroup = (groupId: number) => {
    wsSend({ type: "mod_delete_item_group", payload: { groupId } });
    setExpandedGroupId(null);
  };

  const toggleClassification = (cls: string) => {
    const next = new Set(selectedClassifications);
    if (next.has(cls)) next.delete(cls);
    else next.add(cls);
    setSelectedClassifications(next);
    setPage(0);
  };

  const clearAllFilters = () => {
    setSelectedClassifications(new Set());
    setTierFilter("all");
    setPage(0);
  };

  const getMapName = (mapTypeId: number): string => {
    const mt = mapTypes.value.find((m) => m.id === mapTypeId);
    return mt?.displayName ?? `Map #${mapTypeId}`;
  };

  const activeFilterCount = selectedClassifications.size + (tierFilter !== "all" ? 1 : 0);
  const enabledCount = items.filter((i) => i.enabled).length;

  const handleGroupCreated = () => {
    setShowCreateModal(false);
    wsSend({
      type: "mod_list_items",
      payload: {
        search: search || undefined,
        classifications: selectedClassifications.size > 0 ? Array.from(selectedClassifications) : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        showHidden: showHidden || undefined,
        tierFilter: tierFilter === "all" ? undefined : tierFilter,
        groupsOnly: groupsOnly || undefined,
        includeArchivedGroups: showArchivedGroups || undefined,
      },
    });
  };

  return (
    <section class="mod-section">
      <div class="search-row">
        <div class="search-input-wrap">
          <input
            type="text"
            class="search-input"
            placeholder="Search items & groups..."
            value={search}
            onInput={(e) => {
              setSearch((e.target as HTMLInputElement).value);
              setPage(0);
            }}
          />
          {search && (
            <button
              type="button"
              class="search-clear"
              onClick={() => { setSearch(""); setPage(0); }}
            >
              <IconX size={14} />
            </button>
          )}
        </div>
        <button
          class={`btn-small btn-filter${activeFilterCount > 0 ? " active" : ""}`}
          onClick={() => setFilterOpen(!filterOpen)}
          title="Filter by tier and classification"
        >
          <IconFilter size={14} />
          {activeFilterCount > 0 && (
            <span class="filter-count">{activeFilterCount}</span>
          )}
        </button>
        <button
          class={`btn-small btn-filter${showHidden ? " active" : ""}`}
          onClick={() => { setShowHidden(!showHidden); setPage(0); }}
          title={showHidden ? "Showing all items (click to hide non-goal)" : "Hiding non-goal items (click to show all)"}
        >
          {showHidden ? <IconEye size={14} /> : <IconEyeOff size={14} />}
        </button>
      </div>

      {filterOpen && (
        <div class="classification-filter-dropdown">
          <div class="tier-filter-section">
            <span class="tier-filter-label">Tier</span>
            <div class="tier-filter-buttons">
              {(["all", "S", "A", "B", "unset"] as const).map((t) => (
                <button
                  key={t}
                  class={`tier-filter-btn${tierFilter === t ? " active" : ""}`}
                  onClick={() => { setTierFilter(t); setPage(0); }}
                >
                  {t === "all" ? "All" : t === "unset" ? "Unset" : t}
                </button>
              ))}
            </div>
          </div>

          {classifications.length > 0 && (
            <>
              <div class="class-filter-search">
                <input
                  type="text"
                  placeholder="Search classifications..."
                  value={classSearch}
                  onInput={(e) => setClassSearch((e.target as HTMLInputElement).value)}
                />
                {classSearch && (
                  <button type="button" class="search-clear-btn" onClick={() => setClassSearch("")}>
                    <IconX size={12} />
                  </button>
                )}
              </div>
              <div class="class-filter-list">
                {classifications
                  .filter((cls) => !classSearch || formatClassification(cls).toLowerCase().includes(classSearch.toLowerCase()))
                  .map((cls) => (
                    <button
                      key={cls}
                      class={`class-filter-item${selectedClassifications.has(cls) ? " selected" : ""}`}
                      onClick={() => toggleClassification(cls)}
                    >
                      {formatClassification(cls)}
                    </button>
                  ))}
              </div>
            </>
          )}
          {activeFilterCount > 0 && (
            <button class="btn-clear-filters" onClick={clearAllFilters}>
              Clear All ({activeFilterCount})
            </button>
          )}
        </div>
      )}

      <div class="mice-toolbar">
        <button class="btn-small btn-accent" onClick={() => setShowCreateModal(true)}>
          + Create Group
        </button>
        <label class="toggle-label">
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked={groupsOnly}
              onChange={(e) => { setGroupsOnly((e.target as HTMLInputElement).checked); setPage(0); }}
            />
            <span class="toggle-slider" />
          </label>
          <span class="toggle-label-text">Groups only</span>
        </label>
        <label class="toggle-label">
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked={showArchivedGroups}
              onChange={(e) => { setShowArchivedGroups((e.target as HTMLInputElement).checked); setPage(0); }}
            />
            <span class="toggle-slider" />
          </label>
          <span class="toggle-label-text">Show archived</span>
        </label>
      </div>

      {showCreateModal && (
        <CreateItemGroupModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleGroupCreated}
        />
      )}

      <div class="mod-row-header">
        <span class="mod-row-header-name">Item</span>
        <span class="mod-row-header-controls">Tier</span>
      </div>
      <div class="mod-table-wrap">
        <div class="item-list">
          {items.map((item) =>
            item.isGroup
              ? renderGroupRow(item)
              : renderItemRow(item)
          )}
        </div>
      </div>

      {totalPages > 1 && <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />}

      <p class="mouse-count">
        Showing {items.length} of {total} items ({enabledCount} enabled on this page)
      </p>

      {items.length === 0 && (
        <p class="empty">
          {search ? "No items match your search." : "No items in the database."}
        </p>
      )}
    </section>
  );

  /* ---- Inline row renderers (access closure for handlers) ---- */

  function renderItemRow(item: ItemType) {
    const expanded = expandedId === item.id;
    return (
      <div key={item.id}>
        <div
          class={`item-row${item.enabled ? " row-enabled" : ""}${expanded ? " row-expanded" : ""}`}
          onClick={() => handleExpandItem(item.id)}
        >
          <div class="item-row-info">
            {item.thumbnail && (
              <img class="mod-thumb" src={item.thumbnail} alt="" />
            )}
            <div class="item-row-name">
              <span class="map-name">{item.name}</span>
              <span class="alias-hint">{item.alias || item.type}</span>
            </div>
          </div>
          <div class="item-tier-controls" onClick={(e) => e.stopPropagation()}>
            {TIERS.map((tier) => (
              <button
                key={tier}
                class={`tier-btn-sm tier-btn-${tier.toLowerCase()}${
                  item.globalTier === tier ? " active" : ""
                }`}
                onClick={() => handleSetGlobalTier(item.id, tier, item.globalTier ?? null)}
                title={tier}
              >
                {tier}
              </button>
            ))}
            <button
              class={`tier-btn-sm item-toggle-btn${item.enabled ? " enabled" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                handleToggle(item.id, !item.enabled);
              }}
              title={item.enabled ? "Disable" : "Enable"}
            >
              {item.enabled ? "\u2713" : "\u2715"}
            </button>
          </div>
        </div>
        {expanded && (
          <ItemDrawer
            item={item}
            mapTiers={selectedItemMapTiers.value}
            riskLocations={selectedItemRiskLocations.value}
            onSaveAlias={handleSaveAlias}
            onSaveThumbnail={handleSaveThumbnail}
            onSetGlobalTier={(tier) => handleSetGlobalTier(item.id, tier, item.globalTier ?? null)}
            onAddMapTier={(mapTypeId, tier) => handleAddMapTier(item.id, mapTypeId, tier)}
            onDeleteMapTier={(mapTypeId) => handleDeleteMapTier(item.id, mapTypeId)}
            getMapName={getMapName}
          />
        )}
      </div>
    );
  }

  function renderGroupRow(group: ItemType) {
    const expanded = expandedGroupId === group.id;
    return (
      <div key={`g${group.id}`}>
        <div
          class={`item-row${expanded ? " row-expanded" : ""}${group.archived ? " row-archived" : ""}`}
          onClick={() => handleExpandGroup(group.id)}
        >
          <div class="item-row-info">
            {group.thumbnail ? (
              <img class="mod-thumb" src={group.thumbnail} alt="" />
            ) : (
              <span class="badge badge-group">Group</span>
            )}
            <div class="item-row-name">
              <span class="map-name">
                {group.name} <span class="badge badge-group">Group</span>
              </span>
              <span class="alias-hint">
                {group.itemCount} items
                {group.archived && <span class="badge badge-archived"> Archived</span>}
                {!group.archived && !group.enabled && <span class="badge badge-inactive"> Disabled</span>}
              </span>
            </div>
          </div>
          <div class="item-tier-controls" onClick={(e) => e.stopPropagation()}>
            {!group.archived && (
              <button
                class={`btn-small ${group.enabled ? "btn-danger-outline" : "btn-accent"}`}
                onClick={() => handleToggleGroup(group.id, !group.enabled)}
              >
                {group.enabled ? "Disable" : "Enable"}
              </button>
            )}
          </div>
        </div>
        {expanded && (
          <ItemGroupDrawer
            group={group}
            members={selectedItemGroupMembers.value}
            onArchive={() => handleArchiveGroup(group.id)}
            onDelete={() => handleDeleteGroup(group.id)}
          />
        )}
      </div>
    );
  }
}

/* ---- Item Group Drawer ---- */

interface ItemGroupDrawerProps {
  group: ItemType;
  members: Array<{ itemTypeId: number; itemName: string; itemThumbnail: string | null }>;
  onArchive: () => void;
  onDelete: () => void;
}

function ItemGroupDrawer({ group, members, onArchive, onDelete }: ItemGroupDrawerProps) {
  return (
    <div class="item-drawer">
      <div class="map-detail-grid">
        <span class="map-detail-label">ID</span>
        <span class="map-detail-value">{group.id}</span>

        <span class="map-detail-label">Name</span>
        <span class="map-detail-value">{group.name}</span>

        <span class="map-detail-label">Status</span>
        <span class="map-detail-value">
          {group.archived ? "Archived" : group.enabled ? "Active" : "Disabled"}
        </span>
      </div>

      <div class="mouse-drawer-section">
        <h4>Component Items ({members.length})</h4>
        {members.length > 0 ? (
          <ul class="group-member-list">
            {members.map((m) => (
              <li key={m.itemTypeId} class="group-member-item">
                {m.itemThumbnail && (
                  <img class="mouse-thumb-sm" src={m.itemThumbnail} alt="" />
                )}
                <span>{m.itemName}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="loading">Loading members...</p>
        )}
      </div>

      <div class="mouse-drawer-section group-drawer-actions">
        {!group.archived && (
          <button
            class="btn-small btn-danger"
            onClick={onArchive}
          >
            Archive Group
            <span class="icon-tooltip">Hides group from active use. Existing orders drain naturally.</span>
          </button>
        )}
        <button
          class="btn-small btn-danger-outline"
          onClick={onDelete}
        >
          Delete Group
          <span class="icon-tooltip">Permanently removes group. Only works if no orders, transactions, or history reference it.</span>
        </button>
      </div>
    </div>
  );
}

/* ---- Item Drawer (expanded detail row with tier overrides) ---- */

interface ItemDrawerProps {
  item: { id: number; name: string; type: string; classification: string; thumbnail: string | null; alias: string | null; globalTier: "S" | "A" | "B" | null; isTradable: boolean; alwaysWarn: boolean };
  mapTiers: ItemMapTier[];
  riskLocations: Array<{ environmentType: string; environmentName: string }>;
  onSaveAlias: (id: number, raw: string) => void;
  onSaveThumbnail: (id: number, raw: string) => void;
  onSetGlobalTier: (tier: "S" | "A" | "B") => void;
  onAddMapTier: (mapTypeId: number, tier: "S" | "A" | "B") => void;
  onDeleteMapTier: (mapTypeId: number) => void;
  getMapName: (mapTypeId: number) => string;
}

function ItemDrawer({ item, mapTiers, riskLocations, onSaveAlias, onSaveThumbnail, onSetGlobalTier, onAddMapTier, onDeleteMapTier, getMapName }: ItemDrawerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [mapSearch, setMapSearch] = useState("");
  const [selectedTier, setSelectedTier] = useState<"S" | "A" | "B">("S");
  const [envSearch, setEnvSearch] = useState("");
  const [showEnvAdd, setShowEnvAdd] = useState(false);

  // Debounced environment search
  useEffect(() => {
    if (!showEnvAdd || envSearch.length < 2) {
      environmentSearchResults.value = [];
      return;
    }
    const timer = setTimeout(() => {
      wsSend({ type: "mod_search_environments", payload: { query: envSearch } });
    }, 250);
    return () => clearTimeout(timer);
  }, [envSearch, showEnvAdd]);

  const envResults = environmentSearchResults.value.filter(
    (env) => !riskLocations.some((rl) => rl.environmentType === env.type),
  );

  const availableMaps = mapTypes.value.filter(
    (mt) => !mapTiers.some((t) => t.mapTypeId === mt.id) &&
      (mapSearch === "" ||
        mt.displayName.toLowerCase().includes(mapSearch.toLowerCase()) ||
        mt.mapType.toLowerCase().includes(mapSearch.toLowerCase()))
  ).slice(0, 15);

  const handleAddMap = (mapTypeId: number) => {
    onAddMapTier(mapTypeId, selectedTier);
    setShowAddForm(false);
    setMapSearch("");
  };

  return (
    <div class="item-drawer">
      <div class="map-detail-grid">
        <span class="map-detail-label">ID</span>
        <span class="map-detail-value">{item.id}</span>

        <span class="map-detail-label">Name</span>
        <span class="map-detail-value">{item.name}</span>

        <span class="map-detail-label">Type slug</span>
        <span class="map-detail-value map-detail-type">{item.type}</span>

        <span class="map-detail-label">Classification</span>
        <span class="map-detail-value">
          {formatClassification(item.classification)}
        </span>

        <span class="map-detail-label">Tradable</span>
        <span class="map-detail-value">{item.isTradable ? "Yes" : "No"}</span>

        <span class="map-detail-label">Thumbnail</span>
        <div class="map-detail-thumb-wrap">
          {item.thumbnail && (
            <img class="map-detail-thumb-preview" src={item.thumbnail} alt="" />
          )}
          <input
            class="map-detail-input"
            type="text"
            defaultValue={item.thumbnail ?? ""}
            placeholder="Thumbnail URL..."
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveThumbnail(item.id, (e.target as HTMLInputElement).value);
            }}
            onBlur={(e) => onSaveThumbnail(item.id, (e.target as HTMLInputElement).value)}
          />
        </div>

        <span class="map-detail-label">Alias</span>
        <div>
          <input
            class="map-detail-input"
            type="text"
            defaultValue={item.alias ?? ""}
            placeholder="Alias..."
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveAlias(item.id, (e.target as HTMLInputElement).value);
            }}
            onBlur={(e) => onSaveAlias(item.id, (e.target as HTMLInputElement).value)}
          />
        </div>

        <span class="map-detail-label">Global Tier</span>
        <div class="mouse-detail-tier-controls">
          {TIERS.map((tier) => (
            <button
              key={tier}
              class={`tier-btn tier-btn-${tier.toLowerCase()}${
                item.globalTier === tier ? " active" : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSetGlobalTier(tier);
              }}
              title={tier}
            >
              {tier}
            </button>
          ))}
          {!item.globalTier && (
            <span class="tier-unset-label">Unset (defaults to B)</span>
          )}
        </div>
      </div>

      {/* Map-specific tier overrides */}
      <div class="mouse-drawer-section">
        <h4>Map-Specific Tiers ({mapTiers.length})</h4>
        {mapTiers.length > 0 && (
          <ul class="map-tier-list">
            {mapTiers.map((mt) => (
              <li key={mt.mapTypeId}>
                <span class="map-name">{getMapName(mt.mapTypeId)}</span>
                <div class="map-tier-buttons">
                  {TIERS.map((tier) => (
                    <button
                      key={tier}
                      class={`tier-btn-sm tier-btn-${tier.toLowerCase()}${mt.tier === tier ? " active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddMapTier(mt.mapTypeId, tier);
                      }}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
                <button
                  class="btn-delete-map-tier"
                  onClick={() => onDeleteMapTier(mt.mapTypeId)}
                  title="Remove override"
                >
                  <IconX size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {showAddForm ? (
          <div class="add-map-tier-form searchable">
            <div class="form-row">
              <div class="search-input-with-clear">
                <input
                  type="text"
                  placeholder="Search maps..."
                  value={mapSearch}
                  onInput={(e) => setMapSearch((e.target as HTMLInputElement).value)}
                  autoFocus
                />
                {mapSearch && (
                  <button
                    type="button"
                    class="search-clear-btn"
                    onClick={() => setMapSearch("")}
                  >
                    <IconX size={12} />
                  </button>
                )}
              </div>
              <select
                value={selectedTier}
                onChange={(e) =>
                  setSelectedTier((e.target as HTMLSelectElement).value as "S" | "A" | "B")
                }
              >
                <option value="S">S</option>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
              <button class="btn-small" onClick={() => {
                setShowAddForm(false);
                setMapSearch("");
              }}>
                Cancel
              </button>
            </div>
            {availableMaps.length > 0 && (
              <ul class="map-search-results">
                {availableMaps.map((mt) => (
                  <li key={mt.id} onClick={() => handleAddMap(mt.id)}>
                    {mt.thumbnail && (
                      <img class="map-thumb-xs" src={mt.thumbnail} alt="" />
                    )}
                    <span class="map-result-name">{mt.displayName}</span>
                    <span class={`quality-sm ${mt.quality}`}>{mt.quality}</span>
                  </li>
                ))}
              </ul>
            )}
            {availableMaps.length === 0 && mapSearch && (
              <p class="no-results">No maps found</p>
            )}
          </div>
        ) : (
          <button class="btn-small btn-add-map-tier" onClick={() => setShowAddForm(true)}>
            + Add Map Override
          </button>
        )}
      </div>

      {/* Goal Risk Settings */}
      <div class="mouse-drawer-section">
        <h4>Goal Risk Settings</h4>

        <div class="risk-toggle-row">
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked={item.alwaysWarn}
              onChange={() => {
                wsSend({ type: "mod_set_item_always_warn", payload: { itemTypeId: item.id, alwaysWarn: !item.alwaysWarn } });
              }}
            />
            <span class="toggle-slider" />
          </label>
          <span class="toggle-label-text">Always warn on match</span>
        </div>

        <div class="risk-locations-section">
          <span class="risk-locations-label">Risk locations ({riskLocations.length})</span>
          {riskLocations.length > 0 && (
            <ul class="risk-location-list">
              {riskLocations.map((loc) => (
                <li key={loc.environmentType} class="risk-location-item">
                  <span class="risk-location-name">{loc.environmentName}</span>
                  <button
                    class="btn-delete-map-tier"
                    onClick={() => wsSend({ type: "mod_remove_item_risk_location", payload: { itemTypeId: item.id, environmentType: loc.environmentType } })}
                    title="Remove location"
                  >
                    <IconX size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showEnvAdd ? (
            <div class="add-map-tier-form searchable">
              <div class="form-row">
                <div class="search-input-with-clear">
                  <input
                    type="text"
                    placeholder="Search environments..."
                    value={envSearch}
                    onInput={(e) => setEnvSearch((e.target as HTMLInputElement).value)}
                    autoFocus
                  />
                  {envSearch && (
                    <button type="button" class="search-clear-btn" onClick={() => setEnvSearch("")}>
                      <IconX size={12} />
                    </button>
                  )}
                </div>
                <button class="btn-small" onClick={() => { setShowEnvAdd(false); setEnvSearch(""); }}>
                  Cancel
                </button>
              </div>
              {envResults.length > 0 && (
                <ul class="map-search-results">
                  {envResults.map((env) => (
                    <li
                      key={env.type}
                      onClick={() => {
                        wsSend({ type: "mod_add_item_risk_location", payload: { itemTypeId: item.id, environmentType: env.type } });
                        setEnvSearch("");
                      }}
                    >
                      <span class="map-result-name">{env.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {envResults.length === 0 && envSearch.length >= 2 && (
                <p class="no-results">No environments found</p>
              )}
            </div>
          ) : (
            <button class="btn-small btn-add-map-tier" onClick={() => setShowEnvAdd(true)}>
              + Add Location
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Create Item Group Modal ---- */

interface CreateItemGroupModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateItemGroupModal({ onClose, onCreated }: CreateItemGroupModalProps) {
  const [name, setName] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<ItemType[]>([]);

  // Debounced item search
  useEffect(() => {
    if (itemSearch.length < 2) return;
    const timer = setTimeout(() => {
      wsSend({ type: "search_items", payload: { query: itemSearch } });
    }, 300);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  const handleAddItem = (item: ItemType) => {
    if (!selectedItems.some((i) => i.id === item.id)) {
      setSelectedItems([...selectedItems, item]);
    }
    setItemSearch("");
  };

  const handleRemoveItem = (itemId: number) => {
    setSelectedItems(selectedItems.filter((i) => i.id !== itemId));
  };

  const handleCreate = () => {
    if (!name.trim() || selectedItems.length < 2) return;
    wsSend({
      type: "mod_create_item_group",
      payload: {
        name: name.trim(),
        itemTypeIds: selectedItems.map((i) => i.id),
      },
    });
    onCreated();
  };

  // Filter out groups and already-selected items from search results
  const results = itemSearch.length >= 2
    ? itemSearchResults.value.filter(
        (r) => !r.isGroup && !selectedItems.some((i) => i.id === r.id)
      )
    : [];

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-content create-group-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">Create Item Group</div>
        <div class="modal-body">
          <div class="form-row">
            <label>Name</label>
            <input
              type="text"
              class="search-input"
              placeholder="Group name..."
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              autoFocus
            />
          </div>

          <div class="form-row">
            <label>Items ({selectedItems.length} selected, minimum 2)</label>
            {selectedItems.length > 0 && (
              <ul class="create-group-mice-list">
                {selectedItems.map((i) => (
                  <li key={i.id} class="create-group-mouse-item">
                    {i.thumbnail && <img class="mouse-thumb-sm" src={i.thumbnail} alt="" />}
                    <span class="create-group-mouse-name">{i.name}</span>
                    <button
                      class="create-group-mouse-remove"
                      onClick={() => handleRemoveItem(i.id)}
                      title="Remove"
                    >
                      <IconX size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div class="search-input-with-clear">
              <input
                type="text"
                placeholder="Search items to add..."
                value={itemSearch}
                onInput={(e) => setItemSearch((e.target as HTMLInputElement).value)}
              />
              {itemSearch && (
                <button
                  type="button"
                  class="search-clear-btn"
                  onClick={() => setItemSearch("")}
                >
                  <IconX size={12} />
                </button>
              )}
            </div>
            {results.length > 0 && (
              <ul class="map-search-results">
                {results.slice(0, 10).map((i) => (
                  <li key={i.id} onClick={() => handleAddItem(i)}>
                    {i.thumbnail && <img class="mouse-thumb-xs" src={i.thumbnail} alt="" />}
                    <span class="map-result-name">{i.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            class="modal-btn confirm"
            disabled={!name.trim() || selectedItems.length < 2}
            onClick={handleCreate}
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}

function formatClassification(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
