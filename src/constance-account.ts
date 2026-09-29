import { Setting } from "obsidian";

/** Meridian uses checkout-email billing tied to this installation. */
export interface ConstanceAccountState {
  billingEmail: string;
  purchasedUses?: number;
  freeUsesToday?: number;
}

export interface ConstanceAccountAdapter {
  state: ConstanceAccountState;
  persist(): Promise<void>;
  refresh?(): void;
}

export function addBillingAccountSettings(containerEl: HTMLElement, adapter: ConstanceAccountAdapter): void {
  const section = containerEl.createDiv({ cls: "constance-account-billing-section" });
  section.createEl("h3", { text: "Billing" });
  const purchased = Math.max(0, Number(adapter.state.purchasedUses) || 0);
  const usedToday = Math.max(0, Number(adapter.state.freeUsesToday) || 0);
  section.createEl("p", { text: `Balance: ${purchased.toLocaleString()} purchased uses. Free uses remaining today: ${Math.max(0, 3 - usedToday)}.` });
  new Setting(section)
    .setName("Email")
    .setDesc("Used for checkout and purchase receipts.")
    .addText((text) => text.setPlaceholder("you@example.com").setValue(adapter.state.billingEmail).onChange(async (value) => {
      adapter.state.billingEmail = value.trim();
      await adapter.persist();
    }));
  const firstHeading = containerEl.querySelector(":scope > h1, :scope > h2");
  if (firstHeading?.nextSibling) containerEl.insertBefore(section, firstHeading.nextSibling);
  else containerEl.prepend(section);
  queueMicrotask(() => {
    for (const item of Array.from(containerEl.querySelectorAll(":scope > .setting-item"))) {
      if (/buy uses|refresh purchased balance/i.test(item.textContent || "")) section.appendChild(item);
    }
  });
}
