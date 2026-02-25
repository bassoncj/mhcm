const STORAGE_KEY = "mhcm_panel_visible";
const PIN_STORAGE_KEY = "mhcm_panel_pinned";
const PANEL_WIDTH = 400;
const EDGE_TRIGGER = 50; // pixels from right edge to trigger show

let visible = true;
let pinned = true;
let hoverVisible = false;
let container: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let hideTimeout: number | null = null;

export async function initPanelFrame(): Promise<void> {
  // Read persisted preferences
  const data = await chrome.storage.local.get([STORAGE_KEY, PIN_STORAGE_KEY]);
  if (data[STORAGE_KEY] === false) visible = false;
  if (data[PIN_STORAGE_KEY] === false) pinned = false;

  // Inject page-level style for body padding (outside shadow DOM)
  const pageStyle = document.createElement("style");
  pageStyle.id = "mhcm-page-style";
  pageStyle.textContent = `
    body.mhcm-panel-open {
      padding-right: ${PANEL_WIDTH}px !important;
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(pageStyle);

  // Container div – shadow host, fixed on right edge
  container = document.createElement("div");
  container.id = "mhcm-panel-container";
  shadowRoot = container.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      position: fixed;
      top: 0;
      right: 0;
      width: ${PANEL_WIDTH}px;
      height: 100vh;
      z-index: 2147483647;
      display: block;
      transform: translateX(0);
      transition: transform 0.2s ease-out;
    }
    :host(.hidden) {
      display: none;
    }
    :host(.slide-out) {
      transform: translateX(100%);
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      border-left: 1px solid #30363d;
    }
  `;
  shadowRoot.appendChild(style);

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("panel/index.html");
  shadowRoot.appendChild(iframe);

  // Send initial pin state to panel once iframe loads
  iframe.addEventListener("load", () => {
    iframe.contentWindow?.postMessage({ type: "mhcm_pin_state", pinned }, "*");
  });

  document.body.appendChild(container);
  updatePanelState();

  // Mouse tracking for auto-show when unpinned
  document.addEventListener("mousemove", handleMouseMove);

  // Listen for pin toggle from panel iframe
  window.addEventListener("message", handlePanelMessage);
}

/** Updates panel visibility and body padding based on current state */
function updatePanelState(): void {
  if (!container) return;

  if (!visible) {
    // Fully hidden via toggle
    container.classList.add("hidden");
    container.classList.remove("slide-out");
    document.body.classList.remove("mhcm-panel-open");
  } else if (pinned) {
    // Pinned: always visible, push content
    container.classList.remove("hidden", "slide-out");
    document.body.classList.add("mhcm-panel-open");
  } else {
    // Unpinned: slide behavior, no content push
    container.classList.remove("hidden");
    container.classList.toggle("slide-out", !hoverVisible);
    document.body.classList.remove("mhcm-panel-open");
  }
}

/** Handles mouse movement for edge-triggered panel reveal */
function handleMouseMove(e: MouseEvent): void {
  if (!visible || pinned) return;

  const nearEdge = e.clientX > window.innerWidth - EDGE_TRIGGER;
  const overPanel = e.clientX > window.innerWidth - PANEL_WIDTH;

  if (nearEdge || overPanel) {
    // Mouse near edge or over panel area - show it
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    if (!hoverVisible) {
      hoverVisible = true;
      updatePanelState();
    }
  } else if (hoverVisible) {
    // Mouse moved away - hide after delay
    if (!hideTimeout) {
      hideTimeout = window.setTimeout(() => {
        hoverVisible = false;
        hideTimeout = null;
        updatePanelState();
      }, 300);
    }
  }
}

/** Handles messages from the panel iframe */
function handlePanelMessage(e: MessageEvent): void {
  if (e.data?.type === "mhcm_toggle_pin") {
    pinned = !pinned;
    hoverVisible = false;
    chrome.storage.local.set({ [PIN_STORAGE_KEY]: pinned });
    updatePanelState();

    // Notify panel of new state
    const iframe = shadowRoot?.querySelector("iframe");
    iframe?.contentWindow?.postMessage({ type: "mhcm_pin_state", pinned }, "*");
  }
}

/** Toggles panel visibility (used by keyboard shortcut) */
export function toggle(): void {
  visible = !visible;
  hoverVisible = false;
  chrome.storage.local.set({ [STORAGE_KEY]: visible });
  updatePanelState();
}
