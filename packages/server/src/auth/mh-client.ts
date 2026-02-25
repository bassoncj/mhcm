import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page, CookieParam } from "puppeteer";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const puppeteer = puppeteerExtra as unknown as {
  use: (plugin: ReturnType<typeof StealthPlugin>) => void;
  launch: (opts: Record<string, unknown>) => Promise<Browser>;
};
puppeteer.use(StealthPlugin());

const __dir = dirname(fileURLToPath(import.meta.url));
const COOKIE_PATH = resolve(__dir, "../../data/mh-service-cookies.json");

const SESSION_URL = "https://www.mousehuntgame.com/managers/ajax/users/session.php";
const PAGE_URL = "https://www.mousehuntgame.com/managers/ajax/pages/page.php";
const SITE_URL = "https://www.mousehuntgame.com/";

const CF_WAIT_MS = 10_000;

interface CorkboardMessage {
  body: string;
  sn_user_id: string;
}

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

interface StoredSession {
  cookies: StoredCookie[];
  uh: string;
}

let browser: Browser | null = null;
let page: Page | null = null;
let uh: string | null = null;
let ready = false;

function loadCookies(): StoredSession | null {
  if (!existsSync(COOKIE_PATH)) return null;
  try {
    const raw = readFileSync(COOKIE_PATH, "utf-8");
    const session: StoredSession = JSON.parse(raw);
    const hgToken = session.cookies.find((c) => c.name === "HG_TOKEN");
    if (!hgToken || hgToken.expires * 1000 < Date.now()) return null;
    if (!session.uh) return null;
    return session;
  } catch {
    return null;
  }
}

function saveCookies(session: StoredSession): void {
  writeFileSync(COOKIE_PATH, JSON.stringify(session, null, 2));
}

function deleteCookies(): void {
  if (existsSync(COOKIE_PATH)) {
    writeFileSync(COOKIE_PATH, "");
  }
}

async function launchBrowser(): Promise<void> {
  const b = await puppeteer.launch({
    headless: true,
    args: [
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--metrics-recording-only",
      "--no-first-run",
    ],
  });
  browser = b;
  page = await b.newPage();

  // Block images, CSS, fonts to save resources
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (type === "image" || type === "stylesheet" || type === "font" || type === "media") {
      req.abort();
    } else {
      req.continue();
    }
  });
}

async function login(): Promise<void> {
  const username = process.env.MH_SERVICE_USERNAME;
  const password = process.env.MH_SERVICE_PASSWORD;
  if (!username || !password) {
    throw new Error("MH_SERVICE_USERNAME and MH_SERVICE_PASSWORD must be set in .env");
  }

  if (!browser || !browser.isConnected()) {
    await launchBrowser();
  }

  console.log("[mh-client] navigating to mousehuntgame.com...");
  await page!.goto(SITE_URL, { waitUntil: "networkidle2", timeout: 60_000 });

  console.log("[mh-client] waiting for CF challenge...");
  await new Promise((r) => setTimeout(r, CF_WAIT_MS));

  console.log("[mh-client] logging in...");
  const loginBody = await page!.evaluate(
    async (url: string, u: string, p: string) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: new URLSearchParams({
          sn: "Hitgrab",
          hg_is_ajax: "1",
          action: "loginHitGrab",
          username: u,
          password: p,
        }).toString(),
      });
      return await res.text();
    },
    SESSION_URL,
    username,
    password,
  );

  const data = JSON.parse(loginBody);
  if (!data?.user?.unique_hash) {
    throw new Error(`MH login failed: ${loginBody.slice(0, 200)}`);
  }

  uh = data.user.unique_hash;
  const cookies = await page!.cookies();

  saveCookies({ cookies: cookies as StoredCookie[], uh: uh! });
  ready = true;
  console.log("[mh-client] logged in successfully");
}

function isHgTokenExpired(): boolean {
  const session = loadCookies();
  return session === null;
}

async function ensureReady(): Promise<void> {
  // Fast path: browser alive and ready, cookies still valid
  if (ready && browser?.isConnected() && !isHgTokenExpired()) {
    return;
  }

  // Browser died or never launched
  if (!browser || !browser.isConnected()) {
    ready = false;
    browser = null;
    page = null;
    uh = null;
  }

  const session = loadCookies();

  if (session) {
    // Valid cookies on disk – launch browser and restore them
    if (!browser) await launchBrowser();
    await page!.setCookie(...session.cookies as CookieParam[]);
    console.log("[mh-client] restoring cookies, navigating...");
    await page!.goto(SITE_URL, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, CF_WAIT_MS));
    uh = session.uh;
    ready = true;
  } else {
    // No cookies or expired – full login
    await login();
  }
}

async function fetchProfile(snUserId: string): Promise<CorkboardMessage[]> {
  const result = await page!.evaluate(
    async (url: string, snuid: string, uhVal: string) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: new URLSearchParams({
          page_class: "HunterProfile",
          "page_arguments[snuid]": snuid,
          uh: uhVal,
          sn: "Hitgrab",
          hg_is_ajax: "1",
          last_read_journal_entry_id: "0",
        }).toString(),
      });
      return await res.text();
    },
    PAGE_URL,
    snUserId,
    uh!,
  );

  const data = JSON.parse(result);
  const messages = data?.page?.tabs?.profile?.subtabs?.[0]?.message_board_view?.messages;
  if (!Array.isArray(messages)) {
    throw new Error(`Unexpected profile response: ${result.slice(0, 200)}`);
  }

  return messages.map((m: { body: string; sn_user_id: string }) => ({
    body: m.body,
    sn_user_id: m.sn_user_id,
  }));
}

export async function fetchCorkboardMessages(snUserId: string): Promise<CorkboardMessage[]> {
  await ensureReady();

  try {
    return await fetchProfile(snUserId);
  } catch (err) {
    // Recovery: invalidate everything, retry once
    console.log(`[mh-client] fetch failed, retrying: ${err}`);
    ready = false;
    deleteCookies();
    if (browser?.isConnected()) await browser.close().catch(() => {});
    browser = null;
    page = null;
    uh = null;

    await ensureReady();
    return await fetchProfile(snUserId);
  }
}

// --- Proxy verification (option 2: use random online user's extension) ---

import { sendToUser, getOnlineUserIds, isUserAfk } from "../ws/connections.js";

interface PendingProxy {
  resolve: (messages: CorkboardMessage[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingProxyVerifications = new Map<number, PendingProxy>();

const PROXY_TIMEOUT_MS = 5_000;
const MAX_PROXY_ATTEMPTS = 3;

function pickProxyUser(excludeUserId: number, triedUserIds: Set<number>): number | null {
  const online = [...getOnlineUserIds()].filter(
    (id) => id !== excludeUserId && !isUserAfk(id) && !pendingProxyVerifications.has(id) && !triedUserIds.has(id),
  );
  if (online.length === 0) return null;
  return online[Math.floor(Math.random() * online.length)];
}

function tryProxyOnce(snUserId: string, excludeUserId: number, triedUserIds: Set<number>): Promise<CorkboardMessage[]> {
  const proxyUserId = pickProxyUser(excludeUserId, triedUserIds);
  if (proxyUserId === null) {
    return Promise.reject(new Error("No eligible proxy users online"));
  }

  triedUserIds.add(proxyUserId);

  return new Promise<CorkboardMessage[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingProxyVerifications.delete(proxyUserId);
      reject(new Error(`Proxy user ${proxyUserId} timed out`));
    }, PROXY_TIMEOUT_MS);

    pendingProxyVerifications.set(proxyUserId, { resolve, reject, timer });

    sendToUser(proxyUserId, {
      type: "verify_mh_link_step",
      payload: { snUserId },
    });
  });
}

export async function fetchCorkboardViaProxy(
  snUserId: string,
  claimantUserId: number,
): Promise<CorkboardMessage[]> {
  let lastError: Error | null = null;
  const triedUserIds = new Set<number>();

  for (let attempt = 0; attempt < MAX_PROXY_ATTEMPTS; attempt++) {
    try {
      return await tryProxyOnce(snUserId, claimantUserId, triedUserIds);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(`[mh-client] proxy attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }

  throw lastError ?? new Error("All proxy verification attempts failed");
}

export function handleProxyVerifyResult(
  proxyUserId: number,
  payload: { success: boolean; messages?: Array<{ body: string; sn_user_id: string }>; error?: string },
): void {
  const pending = pendingProxyVerifications.get(proxyUserId);
  if (!pending) return; // No pending request from this user – ignore

  clearTimeout(pending.timer);
  pendingProxyVerifications.delete(proxyUserId);

  if (!payload.success || !payload.messages) {
    pending.reject(new Error(payload.error || "Proxy user failed to fetch corkboard"));
    return;
  }

  pending.resolve(
    payload.messages.map((m) => ({ body: m.body, sn_user_id: m.sn_user_id })),
  );
}

export async function closeMHClient(): Promise<void> {
  if (browser?.isConnected()) {
    await browser.close().catch(() => {});
  }
  browser = null;
  page = null;
  uh = null;
  ready = false;
}
