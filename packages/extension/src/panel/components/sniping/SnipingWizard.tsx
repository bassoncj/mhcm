import { useState, useEffect } from "preact/hooks";
import type { SnipingWizardMouse, SnipingWizardGroup, SnipingItemWizardItem, SnipingItemWizardGroup, MHActiveMap } from "@mhcm/shared";
import { snipingWizardData, snipingItemWizardData, snipingGoalMode, mySnipingOrders } from "../../signals/sniping.js";
import { activeMaps, sbBalance } from "../../signals/game-state.js";
import { allMapTypes } from "../../signals/maps.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconWand } from "../common/Icons.js";
import { ConfirmModal } from "../common/ConfirmModal.js";

/** Key prefix: "m:123" for mice/items, "g:456" for groups */
type ItemKey = string;
function goalKey(id: number): ItemKey { return `m:${id}`; }
function groupKey(id: number): ItemKey { return `g:${id}`; }

export function SnipingWizard() {
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [checked, setChecked] = useState<Map<ItemKey, boolean>>(new Map());
  const [prices, setPrices] = useState<Map<ItemKey, number>>(new Map());
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
  /** Groups the user has unbundled into individual mice. */
  const [unbundledGroups, setUnbundledGroups] = useState<Set<number>>(new Set());

  const goalMode = snipingGoalMode.value;
  const isItemMode = goalMode === "item";

  // Filter owned maps: prefer maps whose goalType matches the current mode
  const ownedMaps = activeMaps.value.filter(
    (m) => m.is_owner && (!m.goalType || m.goalType === goalMode),
  );
  const wizardData = isItemMode ? snipingItemWizardData.value : snipingWizardData.value;
  const balance = sbBalance.value;

  // Find the effective map
  const effectiveMap: MHActiveMap | null =
    ownedMaps.find((m) => m.map_id === selectedMapId) ?? ownedMaps[0] ?? null;

  // Filter out goals that already have open/matched/in_progress buy orders for this map
  const existingBuyGoalIds = new Set(
    mySnipingOrders.value
      .filter(
        (o) =>
          o.side === "sniper_buy" &&
          ["open", "matched", "in_progress"].includes(o.status) &&
          o.mhMapId === effectiveMap?.map_id
      )
      .map((o) => isItemMode ? o.itemTypeId : o.mouseTypeId)
  );

  // Unified goal list (mice or items depending on mode)
  const wizardGoals: Array<{ id: number; name: string; thumbnail: string | null; avg7d: number | null; avg30d: number | null }> =
    isItemMode
      ? ((wizardData as { items: SnipingItemWizardItem[] } | null)?.items ?? []).map((i) => ({ id: i.itemTypeId, ...i }))
      : ((wizardData as { mice: SnipingWizardMouse[] } | null)?.mice ?? []).map((m) => ({ id: m.mouseTypeId, ...m }));

  // Unified group list
  const wizardGroups: WizardGroupUnified[] = isItemMode
    ? ((wizardData as { groups: SnipingItemWizardGroup[] } | null)?.groups ?? []).map((g) => ({
        groupId: g.groupId, name: g.name, memberIds: g.items.map((i) => i.itemTypeId),
        memberNames: g.items.map((i) => i.name), avg7d: g.avg7d, avg30d: g.avg30d,
      }))
    : ((wizardData as { groups: SnipingWizardGroup[] } | null)?.groups ?? []).map((g) => ({
        groupId: g.groupId, name: g.name, memberIds: g.mice.map((m) => m.mouseTypeId),
        memberNames: g.mice.map((m) => m.name), avg7d: g.avg7d, avg30d: g.avg30d,
      }));

  const filteredGoals = wizardGoals.filter((g) => !existingBuyGoalIds.has(g.id));

  // Goal IDs that are claimed by a checked (non-unbundled) group
  const claimedByGroup = new Set<number>();
  for (const group of wizardGroups) {
    if (unbundledGroups.has(group.groupId)) continue;
    if (checked.get(groupKey(group.groupId))) {
      for (const id of group.memberIds) claimedByGroup.add(id);
    }
  }

  // Individual goals to display: those not claimed by a checked group
  const visibleGoals = filteredGoals.filter((g) => !claimedByGroup.has(g.id));

  // Active (non-unbundled) groups
  const activeGroups = wizardGroups.filter((g) => !unbundledGroups.has(g.groupId));

  // Don't render button if no owned map
  if (ownedMaps.length === 0) return null;

  const handleOpen = () => {
    if (!effectiveMap) return;

    const remaining = effectiveMap.remaining_goals ?? [];
    if (remaining.length === 0) {
      setShowModal(true);
      if (isItemMode) {
        snipingItemWizardData.value = { items: [], groups: [] };
      } else {
        snipingWizardData.value = { mice: [], groups: [] };
      }
      return;
    }

    // Request wizard data from server
    const goalIds = remaining.map((m) => m.uniqueId);
    if (isItemMode) {
      snipingItemWizardData.value = null; // loading state
      wsSend({ type: "get_sniping_item_wizard_data", payload: { itemTypeIds: goalIds } });
    } else {
      snipingWizardData.value = null; // loading state
      wsSend({ type: "get_sniping_wizard_data", payload: { mouseTypeIds: goalIds } });
    }
    setShowModal(true);
  };

  // Initialize checked/prices when wizard data arrives
  useEffect(() => {
    if (!wizardData) return;

    const newChecked = new Map<ItemKey, boolean>();
    const newPrices = new Map<ItemKey, number>();

    // Initialize groups first (checked by default)
    const groupClaimedIds = new Set<number>();
    for (const group of wizardGroups) {
      const key = groupKey(group.groupId);
      newChecked.set(key, true);
      newPrices.set(key, group.avg7d ?? group.avg30d ?? 0);
      for (const id of group.memberIds) groupClaimedIds.add(id);
    }

    // Initialize individual goals (only unclaimed ones checked by default)
    for (const g of filteredGoals) {
      const key = goalKey(g.id);
      newChecked.set(key, !groupClaimedIds.has(g.id));
      newPrices.set(key, g.avg7d ?? g.avg30d ?? 0);
    }

    setChecked(newChecked);
    setPrices(newPrices);
    setUnbundledGroups(new Set());
  }, [wizardData]);

  const handleClose = () => {
    setShowModal(false);
    setShowConfirm(false);
    snipingWizardData.value = null;
    snipingItemWizardData.value = null;
  };

  const toggleCheck = (key: ItemKey) => {
    const next = new Map(checked);
    const wasChecked = next.get(key) ?? false;
    next.set(key, !wasChecked);

    // If checking a group, uncheck overlapping groups
    if (!wasChecked && key.startsWith("g:")) {
      const gid = parseInt(key.slice(2), 10);
      const group = wizardGroups.find((g) => g.groupId === gid);
      if (group) {
        const memberIdSet = new Set(group.memberIds);
        for (const other of activeGroups) {
          if (other.groupId === gid) continue;
          if (other.memberIds.some((id) => memberIdSet.has(id))) {
            next.set(groupKey(other.groupId), false);
          }
        }
        // Uncheck individual goals claimed by this group
        for (const id of group.memberIds) {
          next.set(goalKey(id), false);
        }
      }
    }

    setChecked(next);
  };

  const setPrice = (key: ItemKey, price: number) => {
    const next = new Map(prices);
    next.set(key, Math.max(0, price));
    setPrices(next);
  };

  const unbundleGroup = (groupId: number) => {
    const next = new Set(unbundledGroups);
    next.add(groupId);
    setUnbundledGroups(next);
    // Uncheck the group and check its goals individually
    const nextChecked = new Map(checked);
    nextChecked.delete(groupKey(groupId));
    const group = wizardGroups.find((g) => g.groupId === groupId);
    if (group) {
      for (const id of group.memberIds) {
        if (!existingBuyGoalIds.has(id)) {
          nextChecked.set(goalKey(id), true);
        }
      }
    }
    setChecked(nextChecked);
  };

  const selectAll = () => {
    const next = new Map(checked);
    for (const group of activeGroups) next.set(groupKey(group.groupId), true);
    for (const g of visibleGoals) next.set(goalKey(g.id), true);
    setChecked(next);
  };

  const selectNone = () => {
    const next = new Map(checked);
    for (const group of activeGroups) next.set(groupKey(group.groupId), false);
    for (const g of filteredGoals) next.set(goalKey(g.id), false);
    setChecked(next);
  };

  const deselectZeroPrice = () => {
    const next = new Map(checked);
    for (const group of activeGroups) {
      if ((prices.get(groupKey(group.groupId)) ?? 0) <= 0)
        next.set(groupKey(group.groupId), false);
    }
    for (const g of filteredGoals) {
      if ((prices.get(goalKey(g.id)) ?? 0) <= 0)
        next.set(goalKey(g.id), false);
    }
    setChecked(next);
  };

  // Compute totals
  const selectedGroupCount = activeGroups.filter((g) => checked.get(groupKey(g.groupId))).length;
  const selectedGoalCount = visibleGoals.filter((g) => checked.get(goalKey(g.id))).length;
  const selectedCount = selectedGroupCount + selectedGoalCount;

  let totalCost = 0;
  for (const group of activeGroups) {
    if (checked.get(groupKey(group.groupId)))
      totalCost += prices.get(groupKey(group.groupId)) ?? 0;
  }
  for (const g of visibleGoals) {
    if (checked.get(goalKey(g.id)))
      totalCost += prices.get(goalKey(g.id)) ?? 0;
  }

  const insufficientBalance = balance != null && totalCost > balance;

  const hasZeroPriceSelected = (() => {
    for (const group of activeGroups) {
      if (checked.get(groupKey(group.groupId)) && (prices.get(groupKey(group.groupId)) ?? 0) <= 0)
        return true;
    }
    for (const g of visibleGoals) {
      if (checked.get(goalKey(g.id)) && (prices.get(goalKey(g.id)) ?? 0) <= 0)
        return true;
    }
    return false;
  })();

  const handleSubmit = () => {
    if (!effectiveMap || selectedCount === 0) return;

    // Resolve minRankId from the map type catalog (same for all orders on this map)
    let minRankId: number | undefined;
    if (effectiveMap.reward_type) {
      const mt = allMapTypes.value.find((t) => t.mapType === effectiveMap.reward_type);
      if (mt?.minRank != null) {
        minRankId = mt.minRank;
      }
    }

    // Create group orders
    for (const group of activeGroups) {
      if (!checked.get(groupKey(group.groupId))) continue;
      const price = prices.get(groupKey(group.groupId)) ?? 0;
      if (price <= 0) continue;
      const target = isItemMode ? { itemGroupId: group.groupId } : { mouseGroupId: group.groupId };
      wsSend({
        type: "create_sniping_order",
        payload: {
          ...target,
          goalType: isItemMode ? "item" : "mouse",
          side: "sniper_buy",
          price,
          mhMapId: effectiveMap.map_id,
          mapClass: effectiveMap.map_class || undefined,
          minRankId,
        },
      });
    }

    // Create individual goal orders
    for (const g of visibleGoals) {
      if (!checked.get(goalKey(g.id))) continue;
      const price = prices.get(goalKey(g.id)) ?? 0;
      if (price <= 0) continue;
      const target = isItemMode ? { itemTypeId: g.id } : { mouseTypeId: g.id };
      wsSend({
        type: "create_sniping_order",
        payload: {
          ...target,
          goalType: isItemMode ? "item" : "mouse",
          side: "sniper_buy",
          price,
          mhMapId: effectiveMap.map_id,
          mapClass: effectiveMap.map_class || undefined,
          minRankId,
        },
      });
    }

    handleClose();
  };

  const loadMapData = (map: MHActiveMap) => {
    if (map.remaining_goals?.length) {
      const goalIds = map.remaining_goals.map((m) => m.uniqueId);
      if (isItemMode) {
        snipingItemWizardData.value = null;
        wsSend({ type: "get_sniping_item_wizard_data", payload: { itemTypeIds: goalIds } });
      } else {
        snipingWizardData.value = null;
        wsSend({ type: "get_sniping_wizard_data", payload: { mouseTypeIds: goalIds } });
      }
    } else {
      if (isItemMode) {
        snipingItemWizardData.value = { items: [], groups: [] };
      } else {
        snipingWizardData.value = { mice: [], groups: [] };
      }
    }
  };

  const hasGoals = activeGroups.length > 0 || visibleGoals.length > 0;

  return (
    <>
      <button type="button" class="wizard-btn" onClick={handleOpen}>
        <IconWand size={16} />
        <span class="icon-tooltip">Sniping Wizard</span>
      </button>

      {showModal && (
        <div class="modal-overlay" onClick={handleClose}>
          <div
            class="modal-content wizard-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="modal-header">
              Sniping Wizard{effectiveMap ? ` - ${effectiveMap.name}` : ""}
            </div>

            {ownedMaps.length > 1 && (
              <div class="wizard-map-select">
                <label>
                  Map:
                  <select
                    value={effectiveMap?.map_id ?? ""}
                    onChange={(e) => {
                      const id = parseInt(
                        (e.target as HTMLSelectElement).value,
                        10
                      );
                      setSelectedMapId(id);
                      const map = ownedMaps.find((m) => m.map_id === id);
                      if (map) loadMapData(map);
                    }}
                  >
                    {ownedMaps.map((m) => (
                      <option key={m.map_id} value={m.map_id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div class="modal-body">
              {wizardData === null ? (
                <div class="wizard-loading">Loading remaining {isItemMode ? "items" : "mice"}...</div>
              ) : !hasGoals && filteredGoals.length === 0 ? (
                <div class="wizard-empty">
                  {wizardGoals.length === 0
                    ? `All ${isItemMode ? "items" : "mice"} are accounted for!`
                    : `All remaining ${isItemMode ? "items" : "mice"} already have buy orders!`}
                </div>
              ) : (
                <>
                  <div class="wizard-hint">
                    Create buy orders for remaining {isItemMode ? "items" : "mice"}:
                  </div>

                  <div class="wizard-selection-controls">
                    <button
                      type="button"
                      class="wizard-select-btn"
                      onClick={selectAll}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      class="wizard-select-btn"
                      onClick={selectNone}
                    >
                      None
                    </button>
                    <button
                      type="button"
                      class="wizard-select-btn"
                      onClick={deselectZeroPrice}
                    >
                      Deselect 0 SB
                    </button>
                  </div>

                  <div class="wizard-mice-list">
                    {/* Group proposals */}
                    {activeGroups.map((group) => (
                      <WizardGroupRow
                        key={groupKey(group.groupId)}
                        group={group}
                        checked={checked.get(groupKey(group.groupId)) ?? false}
                        price={prices.get(groupKey(group.groupId)) ?? 0}
                        onToggle={() => toggleCheck(groupKey(group.groupId))}
                        onPriceChange={(p) => setPrice(groupKey(group.groupId), p)}
                        onUnbundle={() => unbundleGroup(group.groupId)}
                        goalLabel={isItemMode ? "items" : "mice"}
                      />
                    ))}

                    {/* Individual goals (not claimed by a checked group) */}
                    {visibleGoals.map((g) => (
                      <WizardGoalRow
                        key={goalKey(g.id)}
                        goal={g}
                        checked={checked.get(goalKey(g.id)) ?? false}
                        price={prices.get(goalKey(g.id)) ?? 0}
                        onToggle={() => toggleCheck(goalKey(g.id))}
                        onPriceChange={(p) => setPrice(goalKey(g.id), p)}
                      />
                    ))}
                  </div>

                  <div
                    class={`wizard-total${insufficientBalance ? " insufficient" : ""}`}
                  >
                    Total: {totalCost.toLocaleString()} SB for {selectedCount}{" "}
                    order{selectedCount !== 1 ? "s" : ""}
                    {balance != null && (
                      <span class="wizard-balance">
                        {" "}
                        (Balance: {balance.toLocaleString()} SB)
                      </span>
                    )}
                    {insufficientBalance && (
                      <span class="wizard-insufficient"> - insufficient</span>
                    )}
                  </div>

                  <div class="wizard-note">
                    Tip: Visit your map in MouseHunt to refresh {isItemMode ? "item" : "mouse"} data.
                  </div>
                </>
              )}
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="modal-btn cancel"
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="button"
                class="modal-btn confirm buy"
                disabled={
                  selectedCount === 0 ||
                  insufficientBalance ||
                  hasZeroPriceSelected ||
                  wizardData === null ||
                  !hasGoals
                }
                onClick={() => setShowConfirm(true)}
              >
                Create {selectedCount} Order{selectedCount !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <ConfirmModal
          title="Confirm Bulk Order Creation"
          confirmLabel={`Create ${selectedCount} Order${selectedCount !== 1 ? "s" : ""}`}
          confirmClass="buy"
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
        >
          <div class="order-confirm-details">
            <div class="order-confirm-row">
              <span class="label">Map</span>
              <span class="value">{effectiveMap?.name ?? "Unknown"}</span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Orders</span>
              <span class="value buy">
                {selectedGroupCount > 0 && `${selectedGroupCount} group${selectedGroupCount !== 1 ? "s" : ""}`}
                {selectedGroupCount > 0 && selectedGoalCount > 0 && " + "}
                {selectedGoalCount > 0 && `${selectedGoalCount} ${isItemMode ? (selectedGoalCount === 1 ? "item" : "items") : (selectedGoalCount === 1 ? "mouse" : "mice")}`}
              </span>
            </div>
            <div class="order-confirm-row">
              <span class="label">Total</span>
              <span class="value">{totalCost.toLocaleString()} SB</span>
            </div>
          </div>
        </ConfirmModal>
      )}
    </>
  );
}

/* ---- Wizard Row Components ---- */

interface WizardGroupUnified {
  groupId: number;
  name: string;
  memberIds: number[];
  memberNames: string[];
  avg7d: number | null;
  avg30d: number | null;
}

function WizardGroupRow({
  group,
  checked,
  price,
  onToggle,
  onPriceChange,
  onUnbundle,
  goalLabel,
}: {
  group: WizardGroupUnified;
  checked: boolean;
  price: number;
  onToggle: () => void;
  onPriceChange: (p: number) => void;
  onUnbundle: () => void;
  goalLabel: string;
}) {
  return (
    <div class={`wizard-mouse-row wizard-group-row${checked ? "" : " unchecked"}`}>
      <label class="wizard-check">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </label>
      <span class="badge badge-group">Group</span>
      <span class="wizard-mouse-name">{group.name}</span>
      <span class="wizard-group-mice" title={group.memberNames.join(", ")}>
        {group.memberIds.length} {goalLabel}
      </span>
      <button
        type="button"
        class="wizard-unbundle-btn"
        onClick={onUnbundle}
        title={`Split into individual ${goalLabel}`}
      >
        Split
      </button>
      <div class="wizard-price-stepper">
        <button
          type="button"
          class="stepper-btn"
          disabled={!checked || price <= 5}
          onClick={() => onPriceChange(price - 5)}
        >
          &minus;
        </button>
        <input
          type="number"
          class="stepper-value"
          value={price}
          disabled={!checked}
          onInput={(e) => {
            const num = parseInt((e.target as HTMLInputElement).value, 10);
            if (!isNaN(num)) onPriceChange(num);
          }}
          min={0}
        />
        <button
          type="button"
          class="stepper-btn"
          disabled={!checked}
          onClick={() => onPriceChange(price + 5)}
        >
          +
        </button>
        <span class="wizard-sb-label">SB</span>
      </div>
    </div>
  );
}

function WizardGoalRow({
  goal,
  checked,
  price,
  onToggle,
  onPriceChange,
}: {
  goal: { id: number; name: string; thumbnail: string | null };
  checked: boolean;
  price: number;
  onToggle: () => void;
  onPriceChange: (p: number) => void;
}) {
  return (
    <div class="wizard-mouse-row">
      <label class="wizard-check">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </label>
      {goal.thumbnail && (
        <img class="mouse-thumb-sm" src={goal.thumbnail} alt="" />
      )}
      <span class="wizard-mouse-name">{goal.name}</span>
      <div class="wizard-price-stepper">
        <button
          type="button"
          class="stepper-btn"
          disabled={!checked || price <= 5}
          onClick={() => onPriceChange(price - 5)}
        >
          &minus;
        </button>
        <input
          type="number"
          class="stepper-value"
          value={price}
          disabled={!checked}
          onInput={(e) => {
            const num = parseInt((e.target as HTMLInputElement).value, 10);
            if (!isNaN(num)) onPriceChange(num);
          }}
          min={0}
        />
        <button
          type="button"
          class="stepper-btn"
          disabled={!checked}
          onClick={() => onPriceChange(price + 5)}
        >
          +
        </button>
        <span class="wizard-sb-label">SB</span>
      </div>
    </div>
  );
}
