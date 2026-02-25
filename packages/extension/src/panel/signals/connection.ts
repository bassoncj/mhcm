import { signal } from "@preact/signals";
import { DEFAULT_SERVER_URL } from "../../shared/constants.js";

export const wsConnected = signal(false);
export const serverUrl = signal(DEFAULT_SERVER_URL);
