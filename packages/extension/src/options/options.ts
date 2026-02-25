import { DEFAULT_SERVER_URL } from "../shared/constants.js";

const urlInput = document.getElementById("server-url") as HTMLInputElement;
const saveBtn = document.getElementById("save") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

// Load saved value
chrome.storage.local.get(["mhcm_server_url"], (data) => {
  urlInput.value = data.mhcm_server_url || DEFAULT_SERVER_URL;
});

saveBtn.addEventListener("click", () => {
  const url = urlInput.value.trim();

  if (!url) {
    statusEl.textContent = "URL cannot be empty.";
    statusEl.style.color = "#f44336";
    return;
  }

  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    statusEl.textContent = "URL must start with ws:// or wss://";
    statusEl.style.color = "#f44336";
    return;
  }

  chrome.storage.local.set({ mhcm_server_url: url }, () => {
    statusEl.textContent = "Saved. Reconnect may be needed.";
    statusEl.style.color = "#4caf50";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 3000);
  });
});
