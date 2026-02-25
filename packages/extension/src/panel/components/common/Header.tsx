import { useState, useRef, useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { isAdmin, isModerator, isVerified } from "../../signals/auth.js";
import { wsConnected } from "../../signals/connection.js";
import { IconMoreVertical, IconRefreshCw, IconUser, IconShield, IconSettings, IconHelpCircle, IconLightbulb, IconPin, IconPinOff, IconBell, IconClock } from "./Icons.js";
import { sendToWorker, wsSend } from "../../hooks/useServiceWorker.js";
import type { Tab } from "../../app.js";

const panelPinned = signal(true);

// Listen for pin state updates from content script
if (typeof window !== "undefined") {
  window.addEventListener("message", (e) => {
    if (e.data?.type === "mhcm_pin_state") {
      panelPinned.value = e.data.pinned;
    }
  });
}

interface HeaderProps {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
}

export function Header({ activeTab, onNavigate }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);

    // Fetch fresh game state via page.php camp call (active maps, identity, etc.)
    sendToWorker({ type: "refresh_game_state" });

    // Re-fetch orders and transactions from the server
    if (wsConnected.value) {
      wsSend({ type: "get_my_orders" });
      wsSend({ type: "get_transactions" });
    }

    // Brief visual feedback
    setTimeout(() => setRefreshing(false), 1000);
  }

  // Close on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [menuOpen]);

  const menuItems: Array<{ tab: Tab; label: string; icon: any; show: boolean }> = [
    { tab: "profile", label: "Profile", icon: <IconUser size={14} />, show: true },
    { tab: "notifications", label: "Notifications", icon: <IconBell size={14} />, show: true },
    { tab: "transactions", label: "History", icon: <IconClock size={14} />, show: true },
    { tab: "faq", label: "FAQ", icon: <IconHelpCircle size={14} />, show: true },
    { tab: "about", label: "About", icon: <IconLightbulb size={14} />, show: true },
    { tab: "moderation", label: "Moderation", icon: <IconShield size={14} />, show: isModerator.value },
    { tab: "admin", label: "Admin", icon: <IconSettings size={14} />, show: isAdmin.value },
  ];

  const visibleItems = menuItems.filter((i) => i.show);
  const isMenuTabActive = visibleItems.some((i) => i.tab === activeTab);

  function handleTogglePin() {
    // Notify content script to toggle pin state
    window.parent.postMessage({ type: "mhcm_toggle_pin" }, "*");
  }

  return (
    <header class="app-header">
      <div class="header-left">
        <button
          class={`pin-btn${panelPinned.value ? " pinned" : ""}`}
          onClick={handleTogglePin}
        >
          {panelPinned.value ? <IconPin size={14} /> : <IconPinOff size={14} />}
          <span class="pin-tooltip">
            {panelPinned.value ? "Unpin (auto-hide)" : "Pin (always visible)"}
          </span>
        </button>
        <h1>Community Marketplace</h1>
      </div>
      <div class="header-right">
        {isVerified.value && (
          <button
            class={`refresh-btn${refreshing ? " refreshing" : ""}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh"
          >
            <IconRefreshCw size={14} />
          </button>
        )}
        <div class="kebab-container" ref={menuRef}>
          <button
            class={`kebab-btn${isMenuTabActive ? " active" : ""}`}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <IconMoreVertical size={16} />
          </button>
          {menuOpen && (
            <div class="kebab-menu">
              {visibleItems.map((item) => (
                <button
                  key={item.tab}
                  class={`kebab-menu-item${activeTab === item.tab ? " active" : ""}`}
                  onClick={() => {
                    onNavigate(item.tab);
                    setMenuOpen(false);
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
              <div class="kebab-menu-divider" />
              <a
                class="kebab-menu-item kofi-link"
                href="https://ko-fi.com/U7U31TLBFT"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                <img
                  src="https://storage.ko-fi.com/cdn/cup-border.png"
                  alt=""
                  class="kofi-icon"
                />
                Support on Ko-fi
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
