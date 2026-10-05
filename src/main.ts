import { reserveNative, renderNativePacks, jobId, recoverNative } from "./native-operations";
import { ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { consumeTimelineUse, generateDeviceId, openCheckout, retryPendingSpendEvents, syncPurchasedUses } from "./billing";
import { addBillingAccountSettings } from "./constance-account";
import { ignoredPath, matchesFilters, type FilterState } from "./filter";
import { parseNote, settingsHash } from "./parser";
import { DEFAULT_SETTINGS } from "./settings";
import type { CachedNote, GroupBy, NamedView, TimelineEvent, TimelineSettings } from "./types";
import { PluginSupport } from "./plugin-support";

export const VIEW_TYPE_MERIDIAN = "meridian-timeline-view";
type TimelineScanResult = { events: TimelineEvent[]; review: CachedNote["review"] };

const emptyFilters = (): FilterState => ({ search: "", folder: "", tag: "", kind: "", uncertainty: "", from: "", to: "" });

export default class MeridianTimelinePlugin extends Plugin {
  declare settings: TimelineSettings;
  support!: PluginSupport;
  billingSummaryRefresh?: () => void;
  private view: MeridianTimelineView | null = null;
  private scanController: AbortController | null = null;
  private scanInFlight: Promise<TimelineScanResult> | null = null;
  private billingPollTimer: number | null = null;
  private preservedSnapshot?: {id:string;source:string;result:TimelineScanResult;notes:number;revealed:boolean};
  async revealSnapshot(): Promise<TimelineScanResult | null> {
    const snapshot=this.preservedSnapshot; if(!snapshot)return null;
    if(!snapshot.revealed) {
      const authorization=await reserveNative({app:this.app,settings:this.settings,persistNative:()=>this.saveSettings()},"meridian-timeline",snapshot.id,snapshot.source,JSON.stringify(snapshot.result),{notes:snapshot.notes},true);
      if(!authorization)return null; snapshot.revealed=true;
    }
    return snapshot.result;
  }
  clearUnrevealedSnapshot():void{if(!this.preservedSnapshot?.revealed)this.preservedSnapshot=undefined;}
  snapshotRevealed(): boolean { return this.preservedSnapshot?.revealed===true; }

  async onload(): Promise<void> {
    this.support = new PluginSupport(this, { name: "Meridian Timeline", summary: "Build an interactive chronology from dates already stored in your notes.", quickStart: ["Open Meridian Timeline.", "Let the default date fields scan the vault.", "Filter or save a named view."], commands: ["Open timeline", "Refresh timeline", "Copy debug log"], troubleshooting: ["Use Copy debug log before reporting a problem.", "Check date formats and ignored paths when events are missing."] });
    this.support.start();
    const saved = await this.loadData() as Partial<TimelineSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved, settingsMode: saved?.settingsMode === "advanced" ? "advanced" : "simple", eraLabels: { ...DEFAULT_SETTINGS.eraLabels, ...(saved?.eraLabels ?? {}) }, cache: saved?.cache ?? {}, namedViews: saved?.namedViews ?? [] };
    await recoverNative({app:this.app,settings:this.settings,persistNative:()=>this.saveSettings()});
    if (!this.settings.constanceDeviceId) { this.settings.constanceDeviceId = generateDeviceId(); await this.saveSettings(); }
    this.registerView(VIEW_TYPE_MERIDIAN, (leaf) => { this.view = new MeridianTimelineView(leaf, this); return this.view; });
    this.addRibbonIcon("clock-3", "Open Meridian Timeline", () => void this.activateView());
    this.addCommand({ id: "open-timeline", name: "Open timeline", callback: () => this.activateView() });
    this.addCommand({ id: "refresh-timeline", name: "Refresh timeline", callback: () => this.refresh() });
    this.addCommand({ id: "fit-all-events", name: "Fit all timeline events", callback: () => this.view?.fitAll() });
    this.addCommand({ id: "cancel-scan", name: "Cancel timeline scan", callback: () => this.cancelScan() });
    this.addCommand({ id: "save-named-view", name: "Save current timeline view", callback: () => this.view?.saveNamedView() });
    void retryPendingSpendEvents(this).then(() => syncPurchasedUses(this));
    this.addSettingTab(new MeridianSettingTab(this.app, this));
    this.registerEvent(this.app.vault.on("modify", (file) => { if (file instanceof TFile && file.extension.toLowerCase() === "md") this.invalidateAndRefresh(file.path); }));
    this.registerEvent(this.app.vault.on("delete", (file) => this.invalidateAndRefresh(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { delete this.settings.cache[oldPath]; this.invalidateAndRefresh(file.path); }));
  }

  refreshBillingSummary(): void { this.billingSummaryRefresh?.(); }

  onunload(): void {
    this.cancelScan();
    if (this.billingPollTimer !== null) window.clearInterval(this.billingPollTimer);
  }
  async saveSettings(): Promise<void> { await this.saveData(this.settings); }
  pollAfterCheckout(): void {
    if (this.billingPollTimer !== null) window.clearInterval(this.billingPollTimer);
    let attempts = 0;
    void syncPurchasedUses(this);
    this.billingPollTimer = window.setInterval(() => {
      attempts += 1;
      void syncPurchasedUses(this);
      if (attempts >= 6 && this.billingPollTimer !== null) {
        window.clearInterval(this.billingPollTimer);
        this.billingPollTimer = null;
      }
    }, 15000);
  }
  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MERIDIAN)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_MERIDIAN, active: true });
    this.app.workspace.revealLeaf(leaf);
    this.view = leaf.view instanceof MeridianTimelineView ? leaf.view : this.view;
    // The view's onOpen performs the initial scan. Reopening an existing leaf
    // should reveal its current result rather than spend another use.
  }
  async refresh(): Promise<void> { await this.view?.loadTimeline(true); }
  cancelScan(): void {
    const controller = this.scanController;
    controller?.abort();
    this.scanController = null;
    if (controller) this.view?.showScanMessage("Cancelling scan…");
  }
  private invalidateAndRefresh(path: string): void {
    delete this.settings.cache[path];
    this.view?.showScanMessage("Notes changed. Select Refresh to update the timeline (uses one scan).");
  }
  async scan(onProgress: (done: number, total: number) => void): Promise<TimelineScanResult> {
    if (this.scanInFlight) return this.scanInFlight;
    const operation = this.runScan(onProgress);
    this.scanInFlight = operation;
    try { return await operation; } finally { if (this.scanInFlight === operation) this.scanInFlight = null; }
  }
  private async runScan(onProgress: (done: number, total: number) => void): Promise<TimelineScanResult> {
    if(this.preservedSnapshot && !this.preservedSnapshot.revealed) {
      const retried=await this.revealSnapshot();
      if(!retried)throw new Error("Timeline confirmation pending. Reconnect or add credits, then retry.");
      return retried;
    }
    const controller = new AbortController(); this.scanController = controller;
    try {
      const files = this.app.vault.getMarkdownFiles().filter((file) => !ignoredPath(file.path, this.settings.ignoredFolders, this.settings.ignoredPatterns));
      if(!this.settings.billingAccountLinked || !this.settings.billingAccessToken)throw new Error("Connect your account in plugin settings to create a timeline using your free allowance.");
      if(files.length>2000)throw new Error("Select a smaller timeline scope (maximum 2,000 notes per bounded local run).");
      const source=JSON.stringify(files.map(f=>[f.path,f.stat.mtime,f.stat.size]));
      const hash = settingsHash(this.settings); const events: TimelineEvent[] = []; const review: CachedNote["review"] = [];
      for (let index = 0; index < files.length; index++) {
        if (controller.signal.aborted) throw new Error("Timeline scan cancelled. No usage was consumed.");
        const file = files[index]; const cached = this.settings.cache[file.path];
        let result: CachedNote;
        if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size && cached.settingsHash === hash) result = cached;
        else { const parsed = parseNote(file.path, await this.app.vault.cachedRead(file), this.settings.dateProperties, this.settings.contentPatterns, this.settings.eraLabels); result = { mtime: file.stat.mtime, size: file.stat.size, settingsHash: hash, events: parsed.events, review: parsed.review }; /* New results remain session-memory until useful reveal. */ }
        events.push(...result.events); review.push(...result.review); onProgress(index + 1, files.length);
      }
      if (controller.signal.aborted) throw new Error("Timeline scan cancelled. No usage was consumed.");
      events.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
      const result = { events: events.slice(0, this.settings.maxEvents), review };
      // Meter only after the scan has completed successfully. The in-flight
      // promise above coalesces duplicate opens/refreshes into one operation.
      this.preservedSnapshot={id:jobId(),source,result,notes:files.length,revealed:false};
      const authorized=await this.revealSnapshot();
      if(!authorized)throw new Error("Timeline authorization pending. Reconnect or add credits, then retry the same snapshot.");
      return authorized;
    } finally {
      if (this.scanController === controller) this.scanController = null;
    }
  }
}

class SaveViewModal extends Modal {
  private name = "";
  constructor(app: ConstructorParameters<typeof Modal>[0], private readonly onSave: (name: string) => void) { super(app); }
  onOpen(): void { this.contentEl.createEl("h2", { text: "Save timeline view" }); new Setting(this.contentEl).setName("View name").addText((text) => { text.setPlaceholder("e.g. World history").onChange((value) => { this.name = value.trim(); }); text.inputEl.focus(); }); new Setting(this.contentEl).addButton((button) => button.setButtonText("Save").setCta().onClick(() => { if (this.name) { this.onSave(this.name); this.close(); } })); }
}

export class MeridianTimelineView extends ItemView {
  private plugin: MeridianTimelinePlugin; private events: TimelineEvent[] = []; private review: CachedNote["review"] = []; private filters = emptyFilters(); private groupBy: GroupBy = "folder"; private zoom = 1; private selected: TimelineEvent | null = null; private scanMessage = "";
  private eventLayer!: HTMLElement; private viewport!: HTMLElement; private statusEl!: HTMLElement;
  constructor(leaf: WorkspaceLeaf, plugin: MeridianTimelinePlugin) { super(leaf); this.plugin = plugin; this.groupBy = plugin.settings.groupBy; }
  getViewType(): string { return VIEW_TYPE_MERIDIAN; }
  getDisplayText(): string { return "Meridian Timeline"; }
  getIcon(): string { return "clock-3"; }
  async onOpen(): Promise<void> { this.renderShell(); await this.loadTimeline(); }
  async onClose(): Promise<void> { this.plugin.cancelScan(); this.plugin.clearUnrevealedSnapshot(); }
  showScanMessage(message: string): void { this.scanMessage = message; if (this.statusEl) this.statusEl.setText(message); }
  async loadTimeline(force = false): Promise<void> {
    if (!this.statusEl) return;
    this.showScanMessage(force ? "Refreshing timeline…" : "Scanning vault…");
    try {
      const result = await this.plugin.scan((done, total) => this.showScanMessage(`Scanning notes: ${done}/${total}`));
      this.events = result.events; this.review = result.review; await this.plugin.saveSettings(); this.renderEvents();
      this.showScanMessage(`Timeline ready. Your lifetime free allowance is used first, then purchased credits; viewing this snapshot again uses no extra credits.`);
    } catch (error) { this.showScanMessage(error instanceof Error ? error.message : "Timeline scan failed."); }
  }
  fitAll(): void { this.zoom = 1; this.renderEvents(); }
  saveNamedView(): void { if(!this.plugin.snapshotRevealed()){new Notice("Reveal the preserved full timeline before saving. Keep this view open through sign-in.");return;} new SaveViewModal(this.app, (name) => { const view: NamedView = { name, ...this.filters, groupBy: this.groupBy }; this.plugin.settings.namedViews = [...this.plugin.settings.namedViews.filter((item) => item.name !== name), view]; void this.plugin.saveSettings(); new Notice(`Meridian saved “${name}”.`); this.renderControls(); }).open(); }
  private renderShell(): void {
    const root = this.contentEl; root.empty(); root.addClass("meridian-root");
    const heading = root.createDiv("meridian-header"); const title = heading.createDiv(); title.createEl("h1", { text: "Meridian Timeline" }); title.createEl("p", { text: "A local, readable chronology of your notes." });
    const actions = heading.createDiv("meridian-actions");  actions.createEl("button", { text: "Refresh" }).addEventListener("click", () => void this.loadTimeline(true)); actions.createEl("button", { text: "Fit all" }).addEventListener("click", () => this.fitAll()); actions.createEl("button", { text: "Zoom −" }).addEventListener("click", () => { this.zoom = Math.max(.5, this.zoom / 1.25); this.renderEvents(); }); actions.createEl("button", { text: "Zoom +" }).addEventListener("click", () => { this.zoom = Math.min(8, this.zoom * 1.25); this.renderEvents(); }); actions.createEl("button", { text: "Focus selected" }).addEventListener("click", () => this.focusSelected()); actions.createEl("button", { text: "Save view" }).addEventListener("click", () => this.saveNamedView());
    this.renderControls();
    const info = root.createDiv("meridian-info"); info.setText("Exact dates are solid, approximate dates are dashed, and uncertain dates are marked with a question badge. Click an event to open its source note.");
    this.viewport = root.createDiv("meridian-viewport"); this.viewport.setAttribute("role", "region"); this.viewport.setAttribute("aria-label", "Interactive timeline"); this.eventLayer = this.viewport.createDiv("meridian-event-layer");
    this.statusEl = root.createDiv("meridian-status"); this.statusEl.setAttribute("role", "status");
    root.createDiv("meridian-review");
  }
  private renderControls(): void {
    const root = this.contentEl; const old = root.querySelector(".meridian-controls"); old?.remove(); const controls = root.createDiv("meridian-controls");
    const text = controls.createEl("input", { type: "search", placeholder: "Search title, path, heading…", value: this.filters.search }); text.setAttribute("aria-label", "Search timeline"); text.addEventListener("input", () => { this.filters.search = text.value; this.renderEvents(); });
    const folder = controls.createEl("select"); folder.setAttribute("aria-label", "Filter by folder"); folder.createEl("option", { value: "", text: "All folders" }); [...new Set(this.events.map((event) => event.folder).filter(Boolean))].sort().forEach((value) => folder.createEl("option", { value, text: value })); folder.value = this.filters.folder; folder.addEventListener("change", () => { this.filters.folder = folder.value; this.renderEvents(); });
    const kind = controls.createEl("select"); kind.setAttribute("aria-label", "Filter by event type"); kind.createEl("option", { value: "", text: "All event types" }); ["point", "span", "approximate", "uncertain"].forEach((value) => kind.createEl("option", { value, text: value[0].toUpperCase() + value.slice(1) })); kind.value = this.filters.kind; kind.addEventListener("change", () => { this.filters.kind = kind.value; this.renderEvents(); });
    const tag = controls.createEl("input", { placeholder: "Tag", value: this.filters.tag }); tag.setAttribute("aria-label", "Filter by tag"); tag.addEventListener("input", () => { this.filters.tag = tag.value; this.renderEvents(); });
    if (this.plugin.settings.namedViews.length) { const saved = controls.createEl("select"); saved.setAttribute("aria-label", "Saved timeline view"); saved.createEl("option", { value: "", text: "Saved views…" }); this.plugin.settings.namedViews.forEach((view) => saved.createEl("option", { value: view.name, text: view.name })); saved.addEventListener("change", () => { const view = this.plugin.settings.namedViews.find((item) => item.name === saved.value); if (!view) return; this.filters = { search: view.search, folder: view.folder, tag: view.tag, kind: view.kind, uncertainty: view.uncertainty, from: view.from, to: view.to }; this.groupBy = view.groupBy; this.renderControls(); this.renderEvents(); }); }
    const group = controls.createEl("select"); group.setAttribute("aria-label", "Color events by"); [["none", "No grouping"], ["folder", "Folder"], ["tag", "Tag"]].forEach(([value, textValue]) => group.createEl("option", { value, text: textValue })); group.value = this.groupBy; group.addEventListener("change", () => { this.groupBy = group.value as GroupBy; this.renderEvents(); });
    const uncertainty = controls.createEl("label"); const checkbox = uncertainty.createEl("input", { type: "checkbox" }); checkbox.checked = this.filters.uncertainty === "uncertain"; uncertainty.appendText(" uncertain only"); checkbox.addEventListener("change", () => { this.filters.uncertainty = checkbox.checked ? "uncertain" : ""; this.renderEvents(); });
  }
  private renderEvents(): void {
    if (!this.eventLayer) return; this.eventLayer.empty();
    const visible = this.events.filter((event) => matchesFilters(event, this.filters));
    if (!visible.length) { this.eventLayer.createDiv("meridian-empty").setText(this.events.length ? "No events match these filters." : "No dated notes yet. Configure properties in Settings or add a date to a note."); this.renderReview(); return; }
    const min = Math.min(...visible.map((event) => event.start)); const max = Math.max(...visible.map((event) => Math.max(event.end, event.start + 86400000))); const range = Math.max(max - min, 86400000); const width = Math.max(this.viewport.clientWidth || 800, 900) * this.zoom; this.eventLayer.style.width = `${width}px`;
    const axis = this.eventLayer.createDiv("meridian-axis"); for (let i = 0; i <= 6; i++) { const year = yearLabel(min + (range * i) / 6); const tick = axis.createDiv("meridian-tick"); tick.style.left = `${(i / 6) * 100}%`; tick.textContent = year; }
    const laneEnds = new Map<string, number[]>(); let maxLane = 0;
    for (const event of visible) { const group = this.groupKey(event); const ends = laneEnds.get(group) ?? []; const eventEnd = Math.max(event.end, event.start + 86400000); let lane = ends.findIndex((end) => end <= event.start); if (lane < 0) { lane = ends.length; ends.push(eventEnd); } else ends[lane] = eventEnd; laneEnds.set(group, ends); maxLane = Math.max(maxLane, lane); const x = ((event.start - min) / range) * 100; const w = Math.max(1.2, ((eventEnd - event.start) / range) * 100); const button = this.eventLayer.createEl("button", { cls: `meridian-event meridian-${event.kind}${event.openEnded ? " meridian-open-ended" : ""}`, attr: { type: "button", "aria-label": `${event.title}, ${event.startLabel}${event.endLabel ? ` to ${event.endLabel}` : ""}${event.openEnded ? ", open ended" : ""}` } }); button.style.left = `${x}%`; button.style.width = `${Math.min(w, 35)}%`; button.style.top = `${44 + lane * 56}px`; button.title = `${event.title} — ${event.startLabel}${event.endLabel ? ` → ${event.endLabel}` : " (open ended)"}`; button.createSpan({ cls: "meridian-event-title", text: event.title }); if (event.uncertain) button.createSpan({ cls: "meridian-badge", text: "?" }); button.addEventListener("click", () => void this.openEvent(event)); }
    this.eventLayer.style.height = `${100 + (maxLane + 1) * 56}px`; this.renderReview();
  }
  private groupKey(event: TimelineEvent): string { if (this.groupBy === "folder") return event.folder || "Vault root"; if (this.groupBy === "tag") return event.tags[0] || "Untagged"; return "All events"; }
  private focusSelected(): void { if (!this.selected) { new Notice("Select an event first."); return; } const el = this.eventLayer.querySelector(`[aria-label^="${CSS.escape(this.selected.title)}"]`); if (el instanceof HTMLElement) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); }
  private async openEvent(event: TimelineEvent): Promise<void> { this.selected = event; const subpath = event.heading ? `#${event.heading}` : event.block ? `#${event.block}` : ""; await this.app.workspace.openLinkText(`${event.sourcePath}${subpath}`, "", false); new Notice(`Opened ${event.title}.`); }
  private renderReview(): void { const box = this.contentEl.querySelector(".meridian-review"); if (!(box instanceof HTMLElement)) return; box.empty(); if (!this.review.length) return; box.createEl("h2", { text: `Review (${this.review.length})` }); const list = box.createEl("ul"); this.review.slice(0, 50).forEach((item) => { const li = list.createEl("li"); li.createEl("button", { text: item.title }).addEventListener("click", () => void this.app.workspace.openLinkText(item.path, "", false)); li.appendText(` — ${item.detail}`); }); if (this.review.length > 50) box.createEl("p", { text: `Showing 50 of ${this.review.length} review items.` }); }
}

function yearLabel(timestamp: number): string { const year = new Date(timestamp).getUTCFullYear(); return year < 0 ? `${Math.abs(year)} BCE` : String(year); }

export class MeridianSettingTab extends PluginSettingTab {
  constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], private readonly plugin: MeridianTimelinePlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this; containerEl.empty();
    const advanced = this.plugin.settings.settingsMode === "advanced";
    new Setting(containerEl).setName("Settings mode").setDesc("Simple shows everyday settings. Advanced adds scan rules, limits, and diagnostics.").addDropdown((dropdown) => dropdown.addOptions({ simple: "Simple", advanced: "Advanced" }).setValue(advanced ? "advanced" : "simple").onChange(async (value) => { this.plugin.settings.settingsMode = value === "advanced" ? "advanced" : "simple"; await this.plugin.saveSettings(); this.display(); }));
    if (advanced) this.plugin.support.addDiagnosticsSetting(containerEl); containerEl.createEl("h2", { text: "Meridian Timeline" }); containerEl.createEl("p", { text: "Meridian reads notes locally and never changes source files. Structured frontmatter is preferred; content scanning is a fallback." });
    const preview = containerEl.createDiv("meridian-settings-preview"); preview.createEl("h3", { text: "Quick preview" }); preview.createEl("p", { text: "Exact dates appear as solid bars; approximate dates use a dashed edge; uncertain/conflicting dates carry a question badge." }); const sample = preview.createDiv("meridian-preview-bars"); sample.createDiv("meridian-preview-bar meridian-preview-exact").setText("Exact"); sample.createDiv("meridian-preview-bar meridian-preview-approx").setText("Approximate"); sample.createDiv("meridian-preview-bar meridian-preview-uncertain").setText("Uncertain?");
    new Setting(containerEl).setName("Date properties").setDesc("Comma-separated properties in priority order; for example date, start, end. Use ISO dates such as 2026-09-30 in notes.").addText((text) => text.setValue(this.plugin.settings.dateProperties.join(", ")).onChange(async (value) => { this.plugin.settings.dateProperties = value.split(",").map((item) => item.trim()).filter(Boolean); await this.plugin.saveSettings(); }));
    if (advanced) new Setting(containerEl).setName("Content patterns").setDesc("Optional regular expressions. Capture the date in group 1; malformed expressions are reported in Review.").addTextArea((text) => text.setValue(this.plugin.settings.contentPatterns.join("\n")).onChange(async (value) => { this.plugin.settings.contentPatterns = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); await this.plugin.saveSettings(); }));
    if (advanced) new Setting(containerEl).setName("Era labels").setDesc("One label=year per line, for example ‘Renaissance=1400’.").addTextArea((text) => text.setValue(Object.entries(this.plugin.settings.eraLabels).map(([key, value]) => `${key}=${value}`).join("\n")).onChange(async (value) => { const eras: Record<string, number> = {}; for (const line of value.split(/\r?\n/)) { const [key, raw] = line.split("="); const year = Number(raw); if (key?.trim() && Number.isFinite(year)) eras[key.trim()] = year; } this.plugin.settings.eraLabels = eras; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Ignored folders").setDesc("Comma-separated vault-relative folders.").addText((text) => text.setValue(this.plugin.settings.ignoredFolders.join(", ")).onChange(async (value) => { this.plugin.settings.ignoredFolders = value.split(",").map((item) => item.trim()).filter(Boolean); await this.plugin.saveSettings(); }));
    if (advanced) new Setting(containerEl).setName("Ignored note patterns").setDesc("Optional regular expressions matched against vault paths.").addTextArea((text) => text.setValue(this.plugin.settings.ignoredPatterns.join("\n")).onChange(async (value) => { this.plugin.settings.ignoredPatterns = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); await this.plugin.saveSettings(); }));
    if (advanced) new Setting(containerEl).setName("Maximum events").setDesc("Limit rendered events to keep large vaults responsive. 5,000 is recommended; Review still reports all scanned notes.").addDropdown((dropdown) => dropdown.addOptions({ [String(this.plugin.settings.maxEvents)]: `${this.plugin.settings.maxEvents.toLocaleString()} · current`, "1000": "1,000 · lighter", "5000": "5,000 · recommended", "10000": "10,000 · large vault", "50000": "50,000 · demanding" }).setValue(String(this.plugin.settings.maxEvents)).onChange(async (value) => { this.plugin.settings.maxEvents = Number(value); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Billing").setHeading(); containerEl.createEl("p",{text:"Connected, verified accounts receive 5 lifetime timeline credits. Each credit covers up to 20 notes; larger timelines use more credits (maximum 2,000 notes per local scan). Creating a timeline uses the account free allowance first, then purchased credits; viewing or saving that immutable snapshot does not charge again. Constance confirms the remaining allowance."});
    const balanceSummary = containerEl.createEl("p", { cls: "meridian-billing-summary", attr: { role: "status", "aria-live": "polite" } });
    const renderBalanceSummary = () => balanceSummary.setText(!this.plugin.settings.billingAccountLinked || !this.plugin.settings.billingAccessToken ? "Create an account or sign in, then Connect to activate your lifetime free allowance and confirm your balance." : `Purchased timeline uses: ${Math.max(0, this.plugin.settings.purchasedUses).toLocaleString()}`);
    this.plugin.billingSummaryRefresh = renderBalanceSummary;
    renderBalanceSummary();
    addBillingAccountSettings(containerEl, { state: this.plugin.settings, appId: "meridian-timeline", installationId: this.plugin.settings.constanceDeviceId, syncBalance: () => syncPurchasedUses(this.plugin), persist: () => this.plugin.saveSettings(), refresh: () => this.display() });
    void renderNativePacks(containerEl,{app:this.app,settings:this.plugin.settings,persistNative:()=>this.plugin.saveSettings()},"meridian-timeline",async plan=>{const {openAccountCheckoutByPrice}=await import("./billing-checkout");await openAccountCheckoutByPrice({state:this.plugin.settings,appId:"meridian-timeline",installationId:this.plugin.settings.constanceDeviceId,persist:()=>this.plugin.saveSettings(),syncBalance:()=>syncPurchasedUses(this.plugin),refreshSession:async()=>{const a=await import("./constance-account");return a.refreshBillingSession(this.plugin.settings,()=>this.plugin.saveSettings());}},plan);});
    new Setting(containerEl).setName("Refresh purchased balance").addButton((button) => button.setButtonText("Refresh").onClick(async () => { button.setDisabled(true); button.setButtonText("Refreshing…"); try { await syncPurchasedUses(this.plugin, true); this.display(); } catch { new Notice("Balance could not be refreshed. Check your connection and retry."); } finally { button.setDisabled(false); button.setButtonText("Refresh"); } }));
    if (advanced) new Setting(containerEl).setName("Privacy and threat model").setHeading(); containerEl.createEl("p", { text: "Notes are read locally and never uploaded or edited. Constance manages account credits and checkout. The local timeline cache includes note paths, titles, and dates." });
    if (advanced) new Setting(containerEl).setName("Named views").setHeading(); this.plugin.settings.namedViews.forEach((view) => new Setting(containerEl).setName(view.name).setDesc(`${view.search || "All notes"} · ${view.groupBy}`).addButton((button) => button.setButtonText("Delete").setWarning().onClick(async () => { this.plugin.settings.namedViews = this.plugin.settings.namedViews.filter((item) => item.name !== view.name); await this.plugin.saveSettings(); this.display(); })));
  }
}
