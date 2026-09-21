import { Setting } from "obsidian";

/**
 * This module keeps its historical filename for source/publish compatibility.
 * Meridian is a backend-less browser-relay client, so it must not collect or
 * persist a Constance account password or bearer session.
 */
export interface ConstanceAccountState {
  billingEmail: string;
}

export interface ConstanceAccountAdapter {
  state: ConstanceAccountState;
  persist(): Promise<void>;
  refresh?(): void;
}

/** Configure the email required by the hosted one-time checkout. */
export function addBillingAccountSettings(containerEl: HTMLElement, adapter: ConstanceAccountAdapter): void {
  new Setting(containerEl)
    .setName("Checkout email")
    .setDesc("Required for Constance checkout and purchase receipts. Usage is tied to this installation, not an account login.")
    .addText((text) => text
      .setPlaceholder("you@example.com")
      .setValue(adapter.state.billingEmail)
      .onChange(async (value) => {
        adapter.state.billingEmail = value.trim();
        await adapter.persist();
      }));
}
