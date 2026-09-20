import { Notice, requestUrl } from "obsidian";
import type MeridianTimelinePlugin from "./main";
import { freeUsesRemaining, isValidBillingEmail, localDateKey, normalizedBalance } from "./billing-policy";
import { claimAccountFreeUsage } from "./constance-account";

const BASE_URL = "https://app.tutivsoft.com";
export const MERIDIAN_APP_ID = "meridian-timeline";
// Kept as a compatibility alias for integrations that imported the original
// scaffold name; both identifiers resolve to Meridian's unique app entry.
export const CONSTANCE_APP_ID = MERIDIAN_APP_ID;
export const MERIDIAN_PRICE_IDS = {
  usd_001: "pri_01m28hmpn9ze05g1fg490xp9f8",
  usd_010: "pri_01m28hmqn785817mzy2tfa89kz",
} as const;

export type MeridianPackKey = keyof typeof MERIDIAN_PRICE_IDS;
export type SpendResult = { kind: "ok"; balance: number } | { kind: "insufficient" } | { kind: "error" };

const billingLocks = new WeakMap<object, Promise<void>>();

function withBillingLock<T>(plugin: MeridianTimelinePlugin, operation: () => Promise<T>): Promise<T> {
  const previous = billingLocks.get(plugin) ?? Promise.resolve();
  const current = previous.then(operation, operation);
  billingLocks.set(plugin, current.then(() => undefined, () => undefined));
  return current;
}

export function generateBillingEventId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return `evt_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function generateDeviceId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function syncPurchasedUses(plugin: MeridianTimelinePlugin): Promise<void> {
  return withBillingLock(plugin, async () => {
    if (!plugin.settings.constanceDeviceId) return;
    try {
      const response = await requestUrl({
        url: `${BASE_URL}/api/v1/public/browser/entitlements`, method: "POST", throw: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: MERIDIAN_APP_ID, external_customer_id: plugin.settings.constanceDeviceId, machine_id: plugin.settings.constanceDeviceId }),
      });
      if (response.status >= 200 && response.status < 300) {
        const balance = normalizedBalance(response.json?.data?.credits?.balance);
        if (balance !== null) {
          plugin.settings.purchasedUses = balance;
          await plugin.saveSettings();
        }
      }
    } catch (error) { console.warn("Meridian: Constance balance sync failed", error); }
  });
}

async function spendPurchasedUseUnlocked(plugin: MeridianTimelinePlugin, stableEventId = generateBillingEventId()): Promise<SpendResult> {
  if (!plugin.settings.constanceDeviceId) return { kind: "error" };
  plugin.settings.pendingSpendEvents = [...(plugin.settings.pendingSpendEvents ?? []), { eventId: stableEventId, amount: 1 }]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.eventId === item.eventId) === index);
  await plugin.saveSettings();
  try {
    const response = await requestUrl({
      url: `${BASE_URL}/api/v1/public/browser/credits/spend`, method: "POST", throw: false,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: MERIDIAN_APP_ID, external_customer_id: plugin.settings.constanceDeviceId, machine_id: plugin.settings.constanceDeviceId, amount: 1, event_id: stableEventId }),
    });
    if (response.status === 402 || response.status === 404) { plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId); await plugin.saveSettings(); return { kind: "insufficient" }; }
    if (response.status < 200 || response.status >= 300) return { kind: "error" };
    const balance = normalizedBalance(response.json?.data?.credits?.balance);
    if (balance === null) return { kind: "error" };
    plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
    await plugin.saveSettings();
    return { kind: "ok", balance };
  } catch (error) { console.warn("Meridian: Constance credit spend failed", error); return { kind: "error" }; }
}

export function spendPurchasedUse(plugin: MeridianTimelinePlugin): Promise<SpendResult> {
  return withBillingLock(plugin, () => spendPurchasedUseUnlocked(plugin));
}

export async function retryPendingSpendEvents(plugin: MeridianTimelinePlugin): Promise<void> {
  for (const pending of [...(plugin.settings.pendingSpendEvents ?? [])]) {
    const result = await spendPurchasedUseUnlocked(plugin, pending.eventId);
    if (result.kind === "error") break;
    plugin.settings.purchasedUses = result.kind === "ok" ? result.balance : 0;
    await plugin.saveSettings();
  }
}

export async function consumeTimelineUse(plugin: MeridianTimelinePlugin): Promise<boolean> {
  return withBillingLock(plugin, async () => {
    if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) {
      new Notice("Meridian: sign in or create a billing account in plugin settings before using the timeline.");
      return false;
    }
    const today = localDateKey();
    const previousDate = plugin.settings.freeUsesDate;
    const previousUsed = plugin.settings.freeUsesToday;
    if (plugin.settings.freeUsesDate !== today) { plugin.settings.freeUsesDate = today; plugin.settings.freeUsesToday = 0; }
    const free = await claimAccountFreeUsage(plugin.settings, MERIDIAN_APP_ID, plugin.settings.constanceDeviceId, `free_${generateBillingEventId()}`, 1);
    if (free.kind === "ok") {
      plugin.settings.freeUsesToday = Math.max(0, 3 - free.remaining);
      try { await plugin.saveSettings(); } catch (error) { plugin.settings.freeUsesDate = previousDate; plugin.settings.freeUsesToday = previousUsed; throw error; }
      return true;
    }
    if (free.kind === "auth-required") { plugin.settings.billingAccessToken = ""; plugin.settings.billingAccountLinked = false; await plugin.saveSettings(); new Notice("Meridian: your billing session expired. Sign in again in plugin settings."); return false; }
    if (free.kind === "error") { new Notice("Meridian: the account allowance could not be verified."); return false; }
    const result = await spendPurchasedUseUnlocked(plugin);
    if (result.kind === "ok") {
      plugin.settings.purchasedUses = result.balance;
      try { await plugin.saveSettings(); } catch (error) { console.warn("Meridian: could not persist purchased balance", error); }
      return true;
    }
    if (result.kind === "insufficient") {
      plugin.settings.purchasedUses = 0;
      try { await plugin.saveSettings(); } catch (error) { console.warn("Meridian: could not persist empty purchased balance", error); }
      new Notice("Meridian: today’s free uses are used. Buy more uses in Settings → Meridian Timeline.");
      return false;
    }
    new Notice("Meridian: could not verify purchased uses. Try again when Constance is reachable.");
    return false;
  });
}

export function openCheckout(plugin: MeridianTimelinePlugin, pack: MeridianPackKey): void {
  if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) { new Notice("Sign in or create a billing account in Meridian settings before buying uses."); return; }
  const email = plugin.settings.billingEmail.trim();
  const priceId: string = MERIDIAN_PRICE_IDS[pack];
  if (!plugin.settings.constanceDeviceId) { new Notice("Meridian is still setting up this installation. Try again in a moment."); return; }
  if (!isValidBillingEmail(email)) { new Notice("Enter a valid billing email in Meridian settings first."); return; }
  if (!priceId || priceId === "PENDING_PROVISIONING") { new Notice("Meridian billing is awaiting Constance/Paddle price provisioning."); return; }
  const params = new URLSearchParams({ app_id: MERIDIAN_APP_ID, price_id: priceId, email, external_customer_id: plugin.settings.constanceDeviceId });
  if (!window.open(`${BASE_URL}/buy?${params.toString()}`, "_blank")) {
    new Notice("Meridian checkout could not be opened. Allow pop-ups and try again.");
    return;
  }
  plugin.pollAfterCheckout();
}

export { freeUsesRemaining, localDateKey } from "./billing-policy";
