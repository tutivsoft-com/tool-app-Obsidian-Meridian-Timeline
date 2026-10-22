import {syncEntitlements} from "./constance-v2";
import { diagnostics } from "./diagnostics";
import { resumeAccountCheckout } from "./billing-checkout";
import { openAccountCheckout } from "./billing-checkout";
import { Notice, requestUrl } from "obsidian";
import { claimAccountFreeUsage, spendAccountCredits, refreshBillingSession } from "./constance-account";
import type MeridianTimelinePlugin from "./main";
import { freeUsesRemaining, isValidBillingEmail, localDateKey, normalizedBalance } from "./billing-policy";

const BASE_URL = "https://app.tutivsoft.com";
export const MERIDIAN_APP_ID = "meridian-timeline";
// Kept as a compatibility alias for integrations that imported the original
// scaffold name; both identifiers resolve to Meridian's unique app entry.
export const CONSTANCE_APP_ID = MERIDIAN_APP_ID;
export type MeridianPackKey = "usd_001" | "usd_010";
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
  return `v2consume_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function generateDeviceId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function syncPurchasedUses(plugin: MeridianTimelinePlugin, strict = false): Promise<void> {
await syncEntitlements(plugin.settings,()=>plugin.saveSettings());
(plugin as any).refreshBillingSummary?.();
}

async function spendPurchasedUseUnlocked(plugin: MeridianTimelinePlugin, stableEventId = generateBillingEventId()): Promise<SpendResult> {
const diagnosticEnd3 = diagnostics?.start?.("billing.spendPurchasedUseUnlocked") ?? (() => {});
try {

  if (!plugin.settings.constanceDeviceId) return { kind: "error" };
  plugin.settings.pendingSpendEvents = [...(plugin.settings.pendingSpendEvents ?? []), { eventId: stableEventId, amount: 1 }]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.eventId === item.eventId) === index);
  await plugin.saveSettings();
  try {
    const result = await spendAccountCredits(plugin.settings, MERIDIAN_APP_ID, plugin.settings.constanceDeviceId, stableEventId, 1, () => plugin.saveSettings());
    if (result.kind === "error" || result.kind === "auth-required") return { kind: "error" };
    plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
    try { await plugin.saveSettings(); }
    catch (caughtError1) {
diagnostics.failure("billing.caught_2", caughtError1); plugin.settings.pendingSpendEvents.push({ eventId: stableEventId, amount: 1, kind: "paid" }); throw new Error("Usage receipt could not be saved"); }
    return await (result);
  } catch (caughtError3) {
diagnostics.failure("billing.caught_4", caughtError3); return { kind: "error" }; }

} catch (diagnosticError3) { diagnostics?.failure?.("billing.spendPurchasedUseUnlocked", diagnosticError3); throw diagnosticError3; } finally { diagnosticEnd3(); }
}

export function spendPurchasedUse(plugin: MeridianTimelinePlugin): Promise<SpendResult> {
  return withBillingLock(plugin, () => spendPurchasedUseUnlocked(plugin));
}

export function retryPendingSpendEvents(plugin: MeridianTimelinePlugin): Promise<void> {
return Promise.resolve();
}

export async function consumeTimelineUse(plugin: MeridianTimelinePlugin): Promise<boolean> {
const diagnosticEnd5 = diagnostics?.start?.("billing.consumeTimelineUse") ?? (() => {});
try {

  await retryPendingSpendEvents(plugin);
  return await (withBillingLock(plugin, async () => {
const diagnosticEnd6 = diagnostics?.start?.("billing.background.6320") ?? (() => {});
try {

    if (!plugin.settings.billingAccountLinked) { new Notice("Connect your account in Meridian settings first."); return false; }
    if ((plugin.settings.recoveredTimelineUses ?? 0) > 0) {
      plugin.settings.recoveredTimelineUses!--;
      await plugin.saveSettings(); return true;
    }
    if (plugin.settings.pendingSpendEvents.length) { new Notice("A previous usage request is pending. It will be retried automatically."); return false; }
    const id = `free_${generateBillingEventId()}`;
    plugin.settings.pendingSpendEvents.push({ eventId: id, amount: 1, kind: "free" });
    await plugin.saveSettings();
    const free = await claimAccountFreeUsage(plugin.settings, MERIDIAN_APP_ID, plugin.settings.constanceDeviceId, id, 1, () => plugin.saveSettings());
    if (free.kind === "error" || free.kind === "auth-required") { new Notice("Could not verify your free allowance. Please try again."); return false; }
    plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter(item => item.eventId !== id);
    await plugin.saveSettings();
    if (free.kind === "ok") { plugin.settings.freeUsesToday = Math.max(0, 5 - free.remaining); await plugin.saveSettings(); return true; }
    const result = await spendPurchasedUseUnlocked(plugin);
    if (result.kind === "ok") {
      plugin.settings.purchasedUses = result.balance;
      try { await plugin.saveSettings(); } catch (error) {
diagnostics.failure("billing.caught_extra_2", error); diagnostics?.legacy?.("warn", "billing.meridian_could_not_persist_purchased_balance"); }
      return true;
    }
    if (result.kind === "insufficient") {
      plugin.settings.purchasedUses = 0;
      try { await plugin.saveSettings(); } catch (error) {
diagnostics.failure("billing.caught_extra_3", error); diagnostics?.legacy?.("warn", "billing.meridian_could_not_persist_empty_purchased_balance"); }
      new Notice("Meridian: no free credits remain. Add credits in Settings → Meridian Timeline.");
      return false;
    }
    new Notice("Meridian: purchased credits could not be verified. Check your connection and try again.");
    return false;

} catch (diagnosticError6) { diagnostics?.failure?.("billing.background.6320", diagnosticError6); throw diagnosticError6; } finally { diagnosticEnd6(); }
}));

} catch (diagnosticError5) { diagnostics?.failure?.("billing.consumeTimelineUse", diagnosticError5); throw diagnosticError5; } finally { diagnosticEnd5(); }
}

export async function openCheckout(plugin: MeridianTimelinePlugin, pack: MeridianPackKey): Promise<void> {
await openAccountCheckout({state:plugin.settings,appId:"meridian-timeline",installationId:plugin.settings.constanceDeviceId,persist:()=>plugin.saveSettings(),syncBalance:async()=>{await syncEntitlements(plugin.settings,()=>plugin.saveSettings());(plugin as any).refreshBillingSummary?.();},refreshSession:()=>refreshBillingSession(plugin.settings,()=>plugin.saveSettings())}, typeof pack === "string" && pack.includes("010") ? "onetime-standard" : "onetime");
}

export { freeUsesRemaining, localDateKey } from "./billing-policy";
