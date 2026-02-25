import { useState, useEffect } from "preact/hooks";
import type { MouseTier, MouseType, MouseMapTier, MouseAlias } from "@mhcm/shared";
import { wsSend } from "../../hooks/useServiceWorker.js";
import {
  modMice,
  modMiceTotal,
  selectedMouseId,
  selectedMouseMapTiers,
  selectedMouseAliases,
  modMiceLoading,
  selectedGroupId,
  selectedGroupMembers,
} from "../../signals/moderation.js";
import { mapTypes } from "../../signals/slots.js";
import { mouseSearchResults } from "../../signals/sniping.js";
import { IconX } from "../common/Icons.js";
import { PaginationBar } from "../common/PaginationBar.js";

const TIERS: MouseTier[] = ["S", "A", "B"];
const PAGE_SIZE = 20;

export function MouseTierManager() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<MouseTier | "unset" | "all">("all");
  const [page, setPage] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  const [groupsOnly, setGroupsOnly] = useState(false);

  // Fetch mice on mount and when filters change
  useEffect(() => {
    modMiceLoading.value = true;
    wsSend({
      type: "mod_list_mice",
      payload: {
        search: search || undefined,
        tierFilter: tierFilter === "all" ? null : tierFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        includeArchivedGroups: showArchivedGroups,
        groupsOnly,
      },
    });
  }, [search, tierFilter, page, showArchivedGroups, groupsOnly]);

  const handleSearch = (e: Event) => {
    setSearch((e.target as HTMLInputElement).value);
    setPage(0);
  };

  const handleSetGlobalTier = (mouseId: number, tier: MouseTier, currentTier: MouseTier | null) => {
    wsSend({
      type: "mod_set_mouse_tier",
      payload: { mouseId, tier: tier === currentTier ? null : tier },
    });
  };

  const handleExpandMouse = (mouseId: number) => {
    selectedGroupId.value = null; // close any group drawer
    if (selectedMouseId.value === mouseId) {
      selectedMouseId.value = null;
    } else {
      selectedMouseId.value = mouseId;
      wsSend({ type: "mod_get_mouse_map_tiers", payload: { mouseId } });
      wsSend({ type: "mod_get_mouse_aliases", payload: { mouseId } });
    }
  };

  const handleExpandGroup = (groupId: number) => {
    selectedMouseId.value = null; // close any mouse drawer
    if (selectedGroupId.value === groupId) {
      selectedGroupId.value = null;
    } else {
      selectedGroupId.value = groupId;
      wsSend({ type: "mod_get_group_members", payload: { groupId } });
    }
  };

  const handleToggleGroup = (groupId: number, enabled: boolean) => {
    wsSend({ type: "mod_toggle_group", payload: { groupId, enabled } });
  };

  const handleArchiveGroup = (groupId: number) => {
    wsSend({ type: "mod_archive_group", payload: { groupId } });
    selectedGroupId.value = null;
  };

  const handleDeleteMouseGroup = (groupId: number) => {
    wsSend({ type: "mod_delete_group", payload: { groupId } });
    selectedGroupId.value = null;
  };

  const handleAddMapTier = (mouseId: number, mapTypeId: number, tier: MouseTier) => {
    wsSend({
      type: "mod_set_mouse_map_tier",
      payload: { mouseId, mapTypeId, tier },
    });
  };

  const handleDeleteMapTier = (mouseId: number, mapTypeId: number) => {
    wsSend({
      type: "mod_delete_mouse_map_tier",
      payload: { mouseId, mapTypeId },
    });
  };

  const mice = modMice.value;
  const total = modMiceTotal.value;
  const loading = modMiceLoading.value;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getMapName = (mapTypeId: number): string => {
    const mt = mapTypes.value.find((m) => m.id === mapTypeId);
    return mt?.displayName ?? `Map #${mapTypeId}`;
  };

  const handleGroupCreated = () => {
    setShowCreateModal(false);
    // Re-fetch the list to show the new group
    modMiceLoading.value = true;
    wsSend({
      type: "mod_list_mice",
      payload: {
        search: search || undefined,
        tierFilter: tierFilter === "all" ? null : tierFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        includeArchivedGroups: showArchivedGroups,
      },
    });
  };

  return (
    <div class="mouse-tier-manager">
      <div class="mouse-tier-filters">
        <div class="search-input-wrap">
          <input
            type="text"
            class="search-input"
            placeholder="Search mice & groups..."
            value={search}
            onInput={handleSearch}
          />
          {search && (
            <button type="button" class="search-clear" onClick={() => { setSearch(""); setPage(0); }}>
              <IconX size={14} />
            </button>
          )}
        </div>

        <select
          class="tier-filter-select"
          value={tierFilter}
          onChange={(e) => {
            setTierFilter((e.target as HTMLSelectElement).value as any);
            setPage(0);
          }}
        >
          <option value="all">All tiers</option>
          <option value="S">S tier</option>
          <option value="A">A tier</option>
          <option value="B">B tier</option>
          <option value="unset">Unset</option>
        </select>
      </div>

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
        <CreateGroupModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleGroupCreated}
        />
      )}

      {loading ? (
        <p class="loading">Loading...</p>
      ) : mice.length === 0 ? (
        <p class="empty">No items found.</p>
      ) : (
        <>
          <div class="mod-row-header">
            <span class="mod-row-header-name">Mouse</span>
            <span class="mod-row-header-controls">Tier</span>
          </div>
          <div class="mod-table-wrap">
          <div class="item-list">
            {mice.map((item) =>
              item.isGroup
                ? renderGroupRow(item, selectedGroupId.value, handleExpandGroup, handleToggleGroup)
                : renderMouseRow(item, selectedMouseId.value, handleExpandMouse, (id, tier) => handleSetGlobalTier(id, tier, item.globalTier ?? null))
            )}
          </div>
          </div>

          {totalPages > 1 && <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />}

          <p class="mouse-count">
            Showing {mice.length} of {total} items
          </p>
        </>
      )}
    </div>
  );

  /* ---- Inline row renderers (access closure for drawer props) ---- */

  function renderMouseRow(
    mouse: MouseType,
    expandedId: number | null,
    onExpand: (id: number) => void,
    onSetTier: (id: number, tier: MouseTier) => void,
  ) {
    const expanded = expandedId === mouse.id;
    return (
      <div key={mouse.id}>
        <div
          class={`item-row${expanded ? " row-expanded" : ""}`}
          onClick={() => onExpand(mouse.id)}
        >
          <div class="item-row-info">
            {mouse.thumbnail && (
              <img class="mod-thumb" src={mouse.thumbnail} alt="" />
            )}
            <div class="item-row-name">
              <span class="map-name">{mouse.name}</span>
              <span class="alias-hint">{mouse.aliases || mouse.type}</span>
            </div>
          </div>
          <div class="item-tier-controls" onClick={(e) => e.stopPropagation()}>
            {TIERS.map((tier) => (
              <button
                key={tier}
                class={`tier-btn tier-btn-${tier.toLowerCase()}${
                  mouse.globalTier === tier ? " active" : ""
                }`}
                onClick={() => onSetTier(mouse.id, tier)}
                title={tier}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>
        {expanded && (
          <MouseDrawer
            mouse={mouse}
            mapTiers={selectedMouseMapTiers.value}
            aliases={selectedMouseAliases.value}
            onSetGlobalTier={(tier) => handleSetGlobalTier(mouse.id, tier, mouse.globalTier ?? null)}
            onAddMapTier={(mapTypeId, tier) => handleAddMapTier(mouse.id, mapTypeId, tier)}
            onDeleteMapTier={(mapTypeId) => handleDeleteMapTier(mouse.id, mapTypeId)}
            getMapName={getMapName}
          />
        )}
      </div>
    );
  }

  function renderGroupRow(
    group: MouseType,
    expandedId: number | null,
    onExpand: (id: number) => void,
    onToggle: (id: number, enabled: boolean) => void,
  ) {
    const expanded = expandedId === group.id;
    return (
      <div key={`g${group.id}`}>
        <div
          class={`item-row${expanded ? " row-expanded" : ""}${group.archived ? " row-archived" : ""}`}
          onClick={() => onExpand(group.id)}
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
                {group.mouseCount} mice
                {group.archived && <span class="badge badge-archived"> Archived</span>}
                {!group.archived && !group.enabled && <span class="badge badge-inactive"> Disabled</span>}
              </span>
            </div>
          </div>
          <div class="item-tier-controls" onClick={(e) => e.stopPropagation()}>
            {!group.archived && (
              <button
                class={`btn-small ${group.enabled ? "btn-danger-outline" : "btn-accent"}`}
                onClick={() => onToggle(group.id, !group.enabled)}
              >
                {group.enabled ? "Disable" : "Enable"}
              </button>
            )}
          </div>
        </div>
        {expanded && (
          <GroupDrawer
            group={group}
            members={selectedGroupMembers.value}
            onArchive={() => handleArchiveGroup(group.id)}
            onDelete={() => handleDeleteMouseGroup(group.id)}
          />
        )}
      </div>
    );
  }
}

/* ---- Group Drawer ---- */

interface GroupDrawerProps {
  group: MouseType;
  members: Array<{ mouseTypeId: number; mouseName: string; mouseThumbnail: string | null }>;
  onArchive: () => void;
  onDelete: () => void;
}

function GroupDrawer({ group, members, onArchive, onDelete }: GroupDrawerProps) {
  return (
    <div class="item-drawer">
      <div class="mouse-detail-grid">
        <span class="mouse-detail-label">ID</span>
        <span class="mouse-detail-value">{group.id}</span>

        <span class="mouse-detail-label">Name</span>
        <span class="mouse-detail-value">{group.name}</span>

        <span class="mouse-detail-label">Status</span>
        <span class="mouse-detail-value">
          {group.archived ? "Archived" : group.enabled ? "Active" : "Disabled"}
        </span>
      </div>

      <div class="mouse-drawer-section">
        <h4>Component Mice ({members.length})</h4>
        {members.length > 0 ? (
          <ul class="group-member-list">
            {members.map((m) => (
              <li key={m.mouseTypeId} class="group-member-item">
                {m.mouseThumbnail && (
                  <img class="mouse-thumb-sm" src={m.mouseThumbnail} alt="" />
                )}
                <span>{m.mouseName}</span>
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
            title="Hides group from active use. Existing orders drain naturally."
          >
            Archive Group
          </button>
        )}
        <button
          class="btn-small btn-danger-outline"
          onClick={onDelete}
          title="Permanently removes group. Only works if no orders, transactions, or history reference it."
        >
          Delete Group
        </button>
      </div>
    </div>
  );
}

/* ---- Mouse Drawer (below selected row, same pattern as map drawer) ---- */

interface MouseDrawerProps {
  mouse: MouseType;
  mapTiers: MouseMapTier[];
  aliases: MouseAlias[];
  onSetGlobalTier: (tier: MouseTier) => void;
  onAddMapTier: (mapTypeId: number, tier: MouseTier) => void;
  onDeleteMapTier: (mapTypeId: number) => void;
  getMapName: (mapTypeId: number) => string;
}

function MouseDrawer({
  mouse,
  mapTiers,
  aliases,
  onSetGlobalTier,
  onAddMapTier,
  onDeleteMapTier,
  getMapName,
}: MouseDrawerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [mapSearch, setMapSearch] = useState("");
  const [selectedTier, setSelectedTier] = useState<MouseTier>("S");
  const [newAlias, setNewAlias] = useState("");
  const [editingAliasId, setEditingAliasId] = useState<number | null>(null);
  const [editingAliasText, setEditingAliasText] = useState("");

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
          {/* Detail grid - same layout as map drawer */}
          <div class="mouse-detail-grid">
            <span class="mouse-detail-label">ID</span>
            <span class="mouse-detail-value">{mouse.id}</span>

            <span class="mouse-detail-label">Name</span>
            <span class="mouse-detail-value">{mouse.name}</span>

            <span class="mouse-detail-label">Type</span>
            <span class="mouse-detail-value mouse-detail-type">{mouse.type}</span>

            <span class="mouse-detail-label">Abbrev.</span>
            <span class="mouse-detail-value">{mouse.abbreviatedName}</span>

            <span class="mouse-detail-label">Thumbnail</span>
            <div class="mouse-detail-thumb-wrap">
              {mouse.thumbnail && (
                <img class="mouse-detail-thumb-preview" src={mouse.thumbnail} alt="" />
              )}
              <span class="mouse-detail-value mouse-detail-type">
                {mouse.thumbnail ? "Set" : "None"}
              </span>
            </div>

            <span class="mouse-detail-label">Global Tier</span>
            <div class="mouse-detail-tier-controls">
              {TIERS.map((tier) => (
                <button
                  key={tier}
                  class={`tier-btn tier-btn-${tier.toLowerCase()}${
                    mouse.globalTier === tier ? " active" : ""
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
              {!mouse.globalTier && (
                <span class="tier-unset-label">Unset (defaults to B)</span>
              )}
            </div>
          </div>

          {/* Aliases section */}
          <div class="mouse-drawer-section">
            <h4>Aliases ({aliases.length})</h4>
            {aliases.length > 0 && (
              <ul class="alias-list">
                {aliases.map((a) => (
                  <li key={a.id} class="alias-item">
                    {editingAliasId === a.id ? (
                      <input
                        type="text"
                        class="alias-edit-input"
                        value={editingAliasText}
                        onInput={(e) => setEditingAliasText((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            wsSend({
                              type: "mod_update_mouse_alias",
                              payload: { aliasId: a.id, mouseId: mouse.id, alias: editingAliasText },
                            });
                            setEditingAliasId(null);
                          }
                          if (e.key === "Escape") setEditingAliasId(null);
                        }}
                        onBlur={() => {
                          if (editingAliasText.trim() && editingAliasText !== a.alias) {
                            wsSend({
                              type: "mod_update_mouse_alias",
                              payload: { aliasId: a.id, mouseId: mouse.id, alias: editingAliasText },
                            });
                          }
                          setEditingAliasId(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        class="alias-text"
                        onClick={() => {
                          setEditingAliasId(a.id);
                          setEditingAliasText(a.alias);
                        }}
                        title="Click to edit"
                      >
                        {a.alias}
                      </span>
                    )}
                    {a.source && <span class="alias-source">{a.source}</span>}
                    <button
                      class="btn-delete-alias"
                      onClick={() => wsSend({
                        type: "mod_delete_mouse_alias",
                        payload: { aliasId: a.id, mouseId: mouse.id },
                      })}
                      title="Remove alias"
                    >
                      <IconX size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div class="add-alias-form">
              <input
                type="text"
                class="alias-add-input"
                placeholder="Add alias..."
                value={newAlias}
                onInput={(e) => setNewAlias((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newAlias.trim()) {
                    wsSend({
                      type: "mod_add_mouse_alias",
                      payload: { mouseId: mouse.id, alias: newAlias.trim() },
                    });
                    setNewAlias("");
                  }
                }}
              />
              <button
                class="btn-small"
                disabled={!newAlias.trim()}
                onClick={() => {
                  if (newAlias.trim()) {
                    wsSend({
                      type: "mod_add_mouse_alias",
                      payload: { mouseId: mouse.id, alias: newAlias.trim() },
                    });
                    setNewAlias("");
                  }
                }}
              >
                + Add
              </button>
            </div>
          </div>

          {/* Map-specific tiers section */}
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
                      setSelectedTier((e.target as HTMLSelectElement).value as MouseTier)
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
    </div>
  );
}

/* ---- Create Group Modal ---- */

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [mouseSearch, setMouseSearch] = useState("");
  const [selectedMice, setSelectedMice] = useState<MouseType[]>([]);

  // Debounced mouse search
  useEffect(() => {
    if (mouseSearch.length < 2) return;
    const timer = setTimeout(() => {
      wsSend({ type: "search_mice", payload: { query: mouseSearch } });
    }, 300);
    return () => clearTimeout(timer);
  }, [mouseSearch]);

  const handleAddMouse = (mouse: MouseType) => {
    if (!selectedMice.some((m) => m.id === mouse.id)) {
      setSelectedMice([...selectedMice, mouse]);
    }
    setMouseSearch("");
  };

  const handleRemoveMouse = (mouseId: number) => {
    setSelectedMice(selectedMice.filter((m) => m.id !== mouseId));
  };

  const handleCreate = () => {
    if (!name.trim() || selectedMice.length < 2) return;
    wsSend({
      type: "mod_create_group",
      payload: {
        name: name.trim(),
        mouseTypeIds: selectedMice.map((m) => m.id),
      },
    });
    onCreated();
  };

  // Filter out groups and already-selected mice from search results
  const results = mouseSearch.length >= 2
    ? mouseSearchResults.value.filter(
        (r) => !r.isGroup && !selectedMice.some((m) => m.id === r.id)
      )
    : [];

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-content create-group-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">Create Mouse Group</div>
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
            <label>Mice ({selectedMice.length} selected, minimum 2)</label>
            {selectedMice.length > 0 && (
              <ul class="create-group-mice-list">
                {selectedMice.map((m) => (
                  <li key={m.id} class="create-group-mouse-item">
                    {m.thumbnail && <img class="mouse-thumb-sm" src={m.thumbnail} alt="" />}
                    <span class="create-group-mouse-name">{m.name}</span>
                    <button
                      class="create-group-mouse-remove"
                      onClick={() => handleRemoveMouse(m.id)}
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
                placeholder="Search mice to add..."
                value={mouseSearch}
                onInput={(e) => setMouseSearch((e.target as HTMLInputElement).value)}
              />
              {mouseSearch && (
                <button
                  type="button"
                  class="search-clear-btn"
                  onClick={() => setMouseSearch("")}
                >
                  <IconX size={12} />
                </button>
              )}
            </div>
            {results.length > 0 && (
              <ul class="map-search-results">
                {results.slice(0, 10).map((m) => (
                  <li key={m.id} onClick={() => handleAddMouse(m)}>
                    {m.thumbnail && <img class="mouse-thumb-xs" src={m.thumbnail} alt="" />}
                    <span class="map-result-name">{m.name}</span>
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
            disabled={!name.trim() || selectedMice.length < 2}
            onClick={handleCreate}
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}
