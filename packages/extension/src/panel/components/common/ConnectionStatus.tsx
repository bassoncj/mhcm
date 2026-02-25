import { wsConnected } from "../../signals/connection.js";
import { isAfk, afkWarning } from "../../signals/auth.js";

export function ConnectionStatus() {
  const connected = wsConnected.value;
  const afk = isAfk.value;
  const idle = afkWarning.value;

  // Determine status: disconnected > afk > idle > connected
  let statusClass: string;
  let statusText: string;
  let title: string;

  if (!connected) {
    statusClass = "disconnected";
    statusText = "Disconnected";
    title = "Not connected to server";
  } else if (afk) {
    statusClass = "afk";
    statusText = "AFK";
    title = "Orders paused - interact with MouseHunt to resume";
  } else if (idle) {
    statusClass = "idle";
    statusText = "AFK warning";
    title = "You'll go AFK in 5 minutes - interact with MouseHunt to stay active";
  } else {
    statusClass = "connected";
    statusText = "Connected";
    title = "Connected to marketplace";
  }

  return (
    <span class={`connection-status ${statusClass}`} title={title}>
      <span class="dot" />
      {statusText}
    </span>
  );
}
