import { useState } from "preact/hooks";
import { isLoggedIn, isVerified, isAdmin, isModerator, gameSettingsValid, gameSettings } from "./signals/auth.js";
import { wsConnected } from "./signals/connection.js";
import { useServiceWorker } from "./hooks/useServiceWorker.js";
import { useAuth } from "./hooks/useAuth.js";
import { Header } from "./components/common/Header.js";
import { LoginForm } from "./components/auth/LoginForm.js";
import { LinkMHAccount } from "./components/auth/LinkMHAccount.js";
import { SlotView } from "./components/slots/SlotView.js";
import { MyOrders } from "./components/common/MyOrders.js";
import { SlotTransactionStatus } from "./components/transactions/SlotTransactionStatus.js";
import { TransactionHistory } from "./components/transactions/TransactionHistory.js";
import { ModerationPanel } from "./components/moderation/ModerationPanel.js";
import { AdminDashboard } from "./components/admin/AdminDashboard.js";
import { ProfileSection } from "./components/common/ProfileSection.js";
import { FAQPage } from "./components/common/FAQPage.js";
import { AboutPage } from "./components/common/AboutPage.js";
import { NotificationsView } from "./components/notifications/NotificationsView.js";
import { IconPuzzle, IconListOrdered, IconCrosshair, IconMap, IconDiamond, IconSettings } from "./components/common/Icons.js";
import { SnipingView } from "./components/sniping/SnipingView.js";
import { SnipingTransactionStatus } from "./components/transactions/SnipingTransactionStatus.js";
import { ItemTransactionStatus } from "./components/transactions/ItemTransactionStatus.js";
import { ItemView } from "./components/items/ItemView.js";
import { MapView } from "./components/maps/MapView.js";
import { MapTransactionStatus } from "./components/transactions/MapTransactionStatus.js";
import { ToastContainer } from "./components/common/Toast.js";
import { ConnectionStatus } from "./components/common/ConnectionStatus.js";
import { AlertOverlay } from "./components/common/AlertOverlay.js";
import { RiskCheckModal } from "./components/common/RiskCheckModal.js";
import { FixSettings } from "./components/auth/FixSettings.js";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard.js";
import { RtConfirmModal } from "./components/transactions/RtConfirmModal.js";
import { rtConfirmPrompt } from "./signals/rt-confirm.js";
import { BetaGate } from "./components/common/BetaGate.js";
import { marketBetaConfig, isBetaTester } from "./signals/beta.js";
import { onboardingComplete } from "./signals/onboarding.js";
import { marketEnabledConfig } from "./signals/admin.js";
import { selectedMapTypeId } from "./signals/slots.js";
import { selectedMouseTypeId, selectedMouseGroupId, selectedMouseInfo, selectedItemTypeId as snipingItemTypeId, selectedItemGroupId as snipingItemGroupId, selectedItemInfo as snipingItemInfo, snipingOrderBook, snipingGoalMode } from "./signals/sniping.js";
import { selectedItemTypeId, itemOrderBook } from "./signals/items.js";
import { wsSend } from "./hooks/useServiceWorker.js";

export type Tab = "marketplace" | "maps" | "sniping" | "items" | "orders" | "transactions" | "moderation" | "admin" | "profile" | "notifications" | "faq" | "about";

/** Check if the current user can access a market (not in beta, or user is a beta tester). */
function canAccessMarket(market: "slots" | "sniping" | "items" | "maps"): boolean {
  return !marketBetaConfig.value[market] || isBetaTester.value || isAdmin.value || isModerator.value;
}

export function App() {
  useServiceWorker();
  useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("marketplace");

  // Not logged in -> show Discord sign-in
  if (!isLoggedIn.value) {
    return (
      <div class="app">
        <Header activeTab={activeTab} onNavigate={setActiveTab} />
        <main class="auth-page">
          <LoginForm onSwitch={() => {}} />
        </main>
      </div>
    );
  }

  // Logged in but MH account not linked -> show linking modal
  if (!isVerified.value) {
    return (
      <div class="app">
        <Header activeTab={activeTab} onNavigate={setActiveTab} />
        <main>
          <LinkMHAccount />
        </main>
      </div>
    );
  }

  // Game settings invalid -> show fix settings view
  if (gameSettingsValid.value === false) {
    return (
      <div class={`app${wsConnected.value ? "" : " disconnected"}`}>
        <Header activeTab={activeTab} onNavigate={setActiveTab} />
        <main class="auth-page">
          <FixSettings settings={gameSettings.value} />
        </main>
        <ConnectionStatus />
      </div>
    );
  }

  // Onboarding incomplete -> show wizard
  if (onboardingComplete.value === false) {
    return (
      <div class={`app${wsConnected.value ? "" : " disconnected"}`}>
        <Header activeTab={activeTab} onNavigate={setActiveTab} />
        <main>
          <OnboardingWizard />
        </main>
        <ConnectionStatus />
      </div>
    );
  }

  // RT manual confirmation required -> show blocking modal
  if (rtConfirmPrompt.value) {
    return (
      <div class={`app${wsConnected.value ? "" : " disconnected"}`}>
        <Header activeTab={activeTab} onNavigate={setActiveTab} />
        <main>
          <RtConfirmModal />
        </main>
        <ConnectionStatus />
      </div>
    );
  }

  // Fully authenticated -> marketplace
  return (
    <div class={`app${wsConnected.value ? "" : " disconnected"}`}>
      <AlertOverlay />
      <RiskCheckModal />
      <Header activeTab={activeTab} onNavigate={setActiveTab} />

      <SlotTransactionStatus />
      <SnipingTransactionStatus />
      <ItemTransactionStatus />
      <MapTransactionStatus />

      <nav class="tabs">
        <button
          class={activeTab === "marketplace" ? "active" : ""}
          onClick={() => {
            setActiveTab("marketplace");
            if (selectedMapTypeId.value) {
              wsSend({ type: "unsubscribe_order_book", payload: { mapTypeId: selectedMapTypeId.value } });
              selectedMapTypeId.value = null;
            }
          }}
        >
          <IconPuzzle size={14} /> Slots
        </button>
        <button
          class={activeTab === "maps" ? "active" : ""}
          onClick={() => setActiveTab("maps")}
        >
          <IconMap size={14} /> Maps
        </button>
        <button
          class={activeTab === "sniping" ? "active" : ""}
          onClick={() => {
            setActiveTab("sniping");
            if (selectedMouseTypeId.value) {
              wsSend({ type: "unsubscribe_sniping_order_book", payload: { mouseTypeId: selectedMouseTypeId.value } });
            } else if (selectedMouseGroupId.value) {
              wsSend({ type: "unsubscribe_sniping_order_book", payload: { mouseGroupId: selectedMouseGroupId.value } });
            } else if (snipingItemTypeId.value) {
              wsSend({ type: "unsubscribe_sniping_order_book", payload: { itemTypeId: snipingItemTypeId.value } });
            } else if (snipingItemGroupId.value) {
              wsSend({ type: "unsubscribe_sniping_order_book", payload: { itemGroupId: snipingItemGroupId.value } });
            }
            selectedMouseTypeId.value = null;
            selectedMouseGroupId.value = null;
            selectedMouseInfo.value = null;
            snipingItemTypeId.value = null;
            snipingItemGroupId.value = null;
            snipingItemInfo.value = null;
            snipingOrderBook.value = null;
            snipingGoalMode.value = "mouse";
          }}
        >
          <IconCrosshair size={14} /> Sniping
        </button>
        <button
          class={activeTab === "items" ? "active" : ""}
          onClick={() => {
            setActiveTab("items");
            if (selectedItemTypeId.value) {
              wsSend({ type: "unsubscribe_item_order_book", payload: { itemTypeId: selectedItemTypeId.value } });
              selectedItemTypeId.value = null;
              itemOrderBook.value = null;
            }
          }}
        >
          <IconDiamond size={14} /> Items
        </button>
        <button
          class={activeTab === "orders" ? "active" : ""}
          onClick={() => setActiveTab("orders")}
        >
          <IconListOrdered size={14} /> Orders
        </button>
      </nav>

      {!wsConnected.value && (
        <div class="disconnected-banner">
          Not connected to server
        </div>
      )}

      <main>
        {activeTab === "marketplace" && (
          canAccessMarket("slots") ? (
            <div class={!marketEnabledConfig.value.slots ? "market-paused" : undefined}>
              {!marketEnabledConfig.value.slots && <MarketPausedBanner />}
              <SlotView />
            </div>
          ) : (
            <BetaGate market="slots" />
          )
        )}

        {activeTab === "maps" && (
          canAccessMarket("maps") ? (
            <div class={!marketEnabledConfig.value.maps ? "market-paused" : undefined}>
              {!marketEnabledConfig.value.maps && <MarketPausedBanner />}
              <MapView />
            </div>
          ) : <BetaGate market="maps" />
        )}

        {activeTab === "sniping" && (
          canAccessMarket("sniping") ? (
            <div class={!marketEnabledConfig.value.sniping ? "market-paused" : undefined}>
              {!marketEnabledConfig.value.sniping && <MarketPausedBanner />}
              <SnipingView />
            </div>
          ) : <BetaGate market="sniping" />
        )}

        {activeTab === "items" && (
          canAccessMarket("items") ? (
            <div class={!marketEnabledConfig.value.items ? "market-paused" : undefined}>
              {!marketEnabledConfig.value.items && <MarketPausedBanner />}
              <ItemView />
            </div>
          ) : <BetaGate market="items" />
        )}

        {activeTab === "orders" && <MyOrders />}

        {activeTab === "transactions" && <TransactionHistory />}

        {activeTab === "moderation" && isModerator.value && <ModerationPanel />}

        {activeTab === "admin" && isAdmin.value && <AdminDashboard />}

        {activeTab === "profile" && <ProfileSection />}

        {activeTab === "notifications" && <NotificationsView />}

        {activeTab === "faq" && <FAQPage />}

        {activeTab === "about" && <AboutPage />}
      </main>

      {activeTab !== "about" && <ConnectionStatus />}
      <ToastContainer />
    </div>
  );
}

function MarketPausedBanner() {
  return (
    <div class="market-paused-banner">
      <IconSettings size={14} />
      Trading is temporarily paused for maintenance
    </div>
  );
}


