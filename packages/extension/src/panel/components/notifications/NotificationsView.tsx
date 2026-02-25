import { useState } from "preact/hooks";
import { notificationPrefs, setNotificationPrefs } from "../../signals/notifications.js";
import { subscribedMapTypeIds, mapTypes } from "../../signals/slots.js";
import { itemNotifications, allItemTypes } from "../../signals/items.js";
import { mapNotifications, allMapTypes as allTreasureMapTypes } from "../../signals/maps.js";
import { wsSend, sendToWorker } from "../../hooks/useServiceWorker.js";
import { IconBell, IconBellFilled } from "../common/Icons.js";
import type { NotificationPrefs } from "@mhcm/shared";

type Tab = "general" | "slots" | "sniping" | "items" | "maps";

const PREF_TABS: Record<Tab, Array<{
  id: keyof NotificationPrefs;
  name: string;
  description: string;
  group?: string;
}>> = {
  general: [
    { id: "afk_warning", name: "AFK Warning", description: "5 minutes before going AFK" },
    { id: "afk", name: "AFK Status", description: "When you go AFK" },
  ],
  slots: [
    { id: "slot_sold", name: "Slot Sold", description: "When you sell a map slot" },
    { id: "slot_purchased", name: "Slot Purchased", description: "When you buy a map slot" },
    { id: "map_full", name: "Map Full", description: "When a map you're on fills up" },
    { id: "map_complete", name: "Map Complete", description: "When a treasure map you're on is completed" },
  ],
  sniping: [
    { id: "sniper_joined", name: "Sniper Joined", description: "A sniper joined your map", group: "As Maptain" },
    { id: "mouse_caught", name: "Mouse Caught", description: "A mouse was caught on your map", group: "As Maptain" },
    { id: "sniper_left_early", name: "Sniper Left Early", description: "A sniper left your map before finishing", group: "As Maptain" },
    { id: "sniping_map_complete", name: "Sniping Complete", description: "All sniping orders on your map are done", group: "As Maptain" },
    { id: "sniping_assigned", name: "Assigned to Map", description: "You joined a map", group: "As Sniper" },
    { id: "sniper_catch_confirmed", name: "Catch Confirmed", description: "Your mouse catch was confirmed", group: "As Sniper" },
    { id: "sniping_job_complete", name: "Job Complete", description: "All your work on a map is done", group: "As Sniper" },
  ],
  items: [
    { id: "item_sold", name: "Item Sold", description: "When someone buys your item" },
    { id: "item_purchased", name: "Item Purchased", description: "When you buy an item" },
  ],
  maps: [
    { id: "map_sold", name: "Map Sold", description: "When you sell a treasure map" },
    { id: "map_purchased", name: "Map Purchased", description: "When you buy a treasure map" },
  ],
};

const TAB_LABELS: Record<Tab, string> = {
  general: "General",
  slots: "Slots",
  sniping: "Sniping",
  items: "Items",
  maps: "Maps",
};

export function NotificationsView() {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const prefs = notificationPrefs.value;

  function handleToggle(id: keyof NotificationPrefs, enabled: boolean) {
    const newPrefs = { ...prefs, [id]: enabled };
    setNotificationPrefs(newPrefs);
    wsSend({ type: "update_notification_prefs", payload: { [id]: enabled } });
    sendToWorker({ type: "set_notification_prefs", payload: newPrefs });
  }

  return (
    <div class="notifications-view">
      <div class="notification-tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            class={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div class="notification-tab-content">
        {activeTab === "sniping" ? (
          <>
            <PrefsSection title="Maptain Notifications" prefs={prefs} options={PREF_TABS.sniping.filter(o => o.group === "As Maptain")} onToggle={handleToggle} />
            <PrefsSection title="Sniper Notifications" prefs={prefs} options={PREF_TABS.sniping.filter(o => o.group === "As Sniper")} onToggle={handleToggle} />
          </>
        ) : (
          <PrefsSection prefs={prefs} options={PREF_TABS[activeTab]} onToggle={handleToggle} />
        )}

        {activeTab === "slots" && <SlotAlerts />}
        {activeTab === "items" && <ItemAlerts />}
        {activeTab === "maps" && <MapAlerts />}
      </div>
    </div>
  );
}

function PrefsSection({
  prefs,
  options,
  onToggle,
  title = "Notification Preferences",
}: {
  prefs: NotificationPrefs;
  options: Array<{ id: keyof NotificationPrefs; name: string; description: string; group?: string }>;
  onToggle: (id: keyof NotificationPrefs, enabled: boolean) => void;
  title?: string;
}) {
  return (
    <div class="card notification-prefs-card">
      <div class="card-header">
        <IconBell size={14} /> {title}
      </div>
      <div class="notification-prefs">
        {options.map((opt) => (
          <div class="notification-row" key={opt.id}>
            <div class="notification-info">
              <span class="notification-name">{opt.name}</span>
              <span class="notification-desc">{opt.description}</span>
            </div>
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={prefs[opt.id]}
                onChange={(e) => onToggle(opt.id, (e.target as HTMLInputElement).checked)}
              />
              <span class="toggle-slider" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotAlerts() {
  const subscribed = subscribedMapTypeIds.value;
  const allMapTypesList = mapTypes.value;

  function getMapInfo(mapTypeId: number) {
    const mt = allMapTypesList.find((m) => m.id === mapTypeId);
    return mt
      ? { name: mt.displayName, thumbnail: mt.thumbnail, quality: mt.quality }
      : { name: `Map #${mapTypeId}`, thumbnail: null, quality: "" };
  }

  return (
    <div class="card subscriptions-card">
      <div class="card-header">
        <IconBellFilled size={14} /> Sell Order Alerts
      </div>
      <p class="card-desc">
        Get notified when new sell orders are created for these map types.
      </p>
      {subscribed.length === 0 ? (
        <p class="empty">No subscriptions. Click the bell icon on a map type to subscribe.</p>
      ) : (
        <div class="subscription-list">
          {subscribed.map((mapTypeId) => {
            const { name, thumbnail, quality } = getMapInfo(mapTypeId);
            return (
              <div key={mapTypeId} class="subscription-item">
                {thumbnail && <img class="map-thumb-sm" src={thumbnail} alt="" />}
                <span class="subscription-name">{name}</span>
                {quality && <span class={`quality ${quality}`}>{quality}</span>}
                <button
                  class="btn-unsubscribe"
                  onClick={() => wsSend({ type: "unsubscribe_map_type", payload: { mapTypeId } })}
                  title="Unsubscribe"
                >
                  <IconBellFilled size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemAlerts() {
  const subscribedItemIds = Array.from(itemNotifications.value);
  const itemTypes = allItemTypes.value;

  function getItemInfo(itemTypeId: number) {
    const it = itemTypes.find((i) => i.id === itemTypeId);
    return it
      ? { name: it.name, thumbnail: it.thumbnail }
      : { name: `Item #${itemTypeId}`, thumbnail: null };
  }

  return (
    <div class="card subscriptions-card">
      <div class="card-header">
        <IconBellFilled size={14} /> Sell Order Alerts
      </div>
      <p class="card-desc">
        Get notified when new sell orders are created for these item types.
      </p>
      {subscribedItemIds.length === 0 ? (
        <p class="empty">No subscriptions. Click the bell icon on an item to subscribe.</p>
      ) : (
        <div class="subscription-list">
          {subscribedItemIds.map((itemTypeId) => {
            const { name, thumbnail } = getItemInfo(itemTypeId);
            return (
              <div key={itemTypeId} class="subscription-item">
                {thumbnail && <img class="map-thumb-sm" src={thumbnail} alt="" />}
                <span class="subscription-name">{name}</span>
                <button
                  class="btn-unsubscribe"
                  onClick={() => wsSend({ type: "toggle_item_notification", payload: { itemTypeId } })}
                  title="Unsubscribe"
                >
                  <IconBellFilled size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MapAlerts() {
  const treasureMapTypes = allTreasureMapTypes.value;

  // Parse compound notification keys ("mapTypeId:mode") into structured entries
  const mapNotificationEntries = Array.from(mapNotifications.value).map((key) => {
    const [id, mode] = key.split(":");
    return { mapTypeId: Number(id), mode };
  });

  function getTreasureMapInfo(mapTypeId: number) {
    const mt = treasureMapTypes.find((m) => m.id === mapTypeId);
    return mt
      ? { name: mt.displayName, thumbnail: mt.thumbnail }
      : { name: `Map #${mapTypeId}`, thumbnail: null };
  }

  return (
    <div class="card subscriptions-card">
      <div class="card-header">
        <IconBellFilled size={14} /> Sell Order Alerts
      </div>
      <p class="card-desc">
        Get notified when new sell orders are created for these treasure map types.
      </p>
      {mapNotificationEntries.length === 0 ? (
        <p class="empty">No subscriptions. Click the bell icon on a map type to subscribe.</p>
      ) : (
        <div class="subscription-list">
          {mapNotificationEntries.map(({ mapTypeId, mode }) => {
            const { name, thumbnail } = getTreasureMapInfo(mapTypeId);
            const modeLabel = mode === "unopened" ? "Unopened" : "Completed";
            return (
              <div key={`${mapTypeId}:${mode}`} class="subscription-item">
                {thumbnail && <img class="map-thumb-sm" src={thumbnail} alt="" />}
                <span class="subscription-name">{name}</span>
                <span class="badge badge-mode">{modeLabel}</span>
                <button
                  class="btn-unsubscribe"
                  onClick={() => wsSend({ type: "toggle_map_notification", payload: { mapTypeId, mode } })}
                  title="Unsubscribe"
                >
                  <IconBellFilled size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
