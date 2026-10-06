import { appendTimeline, timelineMarkdown, timelineJson, timelineSourceText, modifiedEvent, GENERATED_NOTE, type TimelineMode } from "./timeline-output";
import { selectedFiles, markdownFile, registerSelectionAction } from "./selection-scope";
import { diagnostics } from "./diagnostics";
import { reserveNative, renderNativePacks, jobId, recoverNative } from "./native-operations";
import { ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, type ViewStateResult, type TAbstractFile, type MarkdownView } from "obsidian";
import { consumeTimelineUse, generateDeviceId, openCheckout, retryPendingSpendEvents, syncPurchasedUses } from "./billing";
import { addBillingAccountSettings } from "./constance-account";
import { ignoredPath, matchesFilters, type FilterState } from "./filter";
import { parseNote, settingsHash, stableId } from "./parser";
import { DEFAULT_SETTINGS } from "./settings";
import type { CachedNote, GroupBy, NamedView, TimelineEvent, TimelineSettings } from "./types";
import { PluginSupport } from "./plugin-support";
import { registerSidebarIcon } from "./sidebar-icon";
import { registerTimelineMenus } from "./context-menu";
import { axisTicks, layoutEvents } from "./layout";
import { freeUsesRemaining, localDateKey } from "./billing-policy";

export const VIEW_TYPE_MERIDIAN = "meridian-timeline-view";
type TimelineScanResult = { events: TimelineEvent[]; review: CachedNote["review"] };

const emptyFilters = (): FilterState => ({ search: "", folder: "", tag: "", kind: "", uncertainty: "", from: "", to: "" });

export default class MeridianTimelinePlugin extends Plugin {
  declare settings: TimelineSettings;
  support!: PluginSupport;
  billingSummaryRefresh?: () => void;
  private view: MeridianTimelineView | null = null;
  private timelineMode: TimelineMode = "combined";
  getTimelineMode(): TimelineMode { return this.timelineMode; }
  snapshotPaths(): string[] { return this.preservedSnapshot?.revealed ? [...this.preservedSnapshot.paths] : []; }
  async saveTimelineOutputs(): Promise<string> {
    if (this.outputInFlight) return this.outputInFlight;
    if (this.scanInFlight) return "Wait for the current scan to finish before saving timeline files.";
    const operation = this.writeTimelineOutputs();
    this.outputInFlight = operation;
    try { return await operation; } finally { if (this.outputInFlight === operation) this.outputInFlight = null; }
  }
  private async writeTimelineOutputs(): Promise<string> {
    const snapshot = this.preservedSnapshot;
    if (!snapshot?.revealed) return "Open an authorized timeline before saving.";
    const markdown = this.settings.appendTimelineMarkdown;
    const json = this.settings.saveTimelineJson;
    if (!markdown && !json) return "Timeline file saving is disabled.";
    const targets: Array<{ path: string; paths: string[]; events: TimelineEvent[]; review: CachedNote["review"] }> = [];
    if (snapshot.mode === "combined") {
      if (!snapshot.outputPath) {
        const root = this.scopeRoots?.length === 1 ? this.app.vault.getAbstractFileByPath(this.scopeRoots[0]) : null;
        const folder = root && !(root instanceof TFile) ? root.path : "";
        const prefix = folder ? `${folder}/` : "";
        const scopeMarker = `<!-- meridian-timeline:scope ${encodeURIComponent(JSON.stringify(this.scopeRoots))} -->`;
        let suffix = 0;
        while (true) {
          const path = `${prefix}Meridian Timeline${suffix ? ` ${suffix}` : ""}.md`;
          const existing = this.app.vault.getAbstractFileByPath(path);
          const companion = this.app.vault.getAbstractFileByPath(path.replace(/\.md$/i, "") + ".meridian-timeline.json");
          let matchingCompanion = !companion;
          if (companion instanceof TFile) {
            try {
              const data = JSON.parse(await this.app.vault.read(companion));
              matchingCompanion = data?.format === "meridian-timeline" && data.version === 1 && data.mode === "combined" && JSON.stringify(data.scopeRoots) === JSON.stringify(this.scopeRoots);
            } catch { matchingCompanion = false; }
          }
          if (matchingCompanion && (!existing || existing instanceof TFile && (await this.app.vault.read(existing)).replace(/\r\n/g, "\n").startsWith(`${GENERATED_NOTE}\n${scopeMarker}`))) { snapshot.outputPath = path; break; }
          suffix++;
        }
      }
      targets.push({ path: snapshot.outputPath, paths: snapshot.paths, events: snapshot.allEvents, review: snapshot.result.review });
    } else for (const path of snapshot.paths) targets.push({ path, paths: [path], events: snapshot.allEvents.filter(event => event.sourcePath === path), review: snapshot.result.review.filter(item => item.path === path) });
    const failures: string[] = [];
    for (const target of targets) {
      if (markdown && !snapshot.saved.has(`md:${target.path}`)) {
        try {
          const block = timelineMarkdown(target.events, target.review, snapshot.mode, target.paths, target.path);
          const file = this.app.vault.getAbstractFileByPath(target.path);
          if (file instanceof TFile) {
            let sourceMtime = snapshot.modified[file.path];
            await this.app.vault.process(file, source => {
              if (snapshot.mode === "combined" && !source.startsWith(GENERATED_NOTE)) throw new Error("The dedicated timeline note was replaced by another file; it was preserved.");
              const previousWrite = this.settings.generatedNoteStats?.[file.path];
              sourceMtime = previousWrite && previousWrite.mtime === file.stat.mtime && previousWrite.size === file.stat.size ? previousWrite.sourceMtime : file.stat.mtime;
              return appendTimeline(source, block);
            });
            if (snapshot.mode !== "combined") {
              this.settings.generatedNoteStats ??= {};
              this.settings.generatedNoteStats[file.path] = { mtime: file.stat.mtime, size: file.stat.size, sourceMtime };
            }
          } else if (!file && snapshot.mode === "combined") await this.app.vault.create(target.path, `${GENERATED_NOTE}\n<!-- meridian-timeline:scope ${encodeURIComponent(JSON.stringify(this.scopeRoots))} -->\n\n${block}\n`);
          else throw new Error("The source note no longer exists or its path is occupied by a folder.");
          snapshot.saved.add(`md:${target.path}`);
        } catch (error) { failures.push(`${target.path}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      const jsonPath = target.path.replace(/\.md$/i, "") + ".meridian-timeline.json";
      if (json && !snapshot.saved.has(`json:${jsonPath}`)) {
        try {
          const bytes = timelineJson(target.events, target.review, snapshot.mode, target.paths, this.scopeRoots);
          const file = this.app.vault.getAbstractFileByPath(jsonPath);
          if (file instanceof TFile) await this.app.vault.process(file, source => {
            let data: { format?: string; version?: number };
            try { data = JSON.parse(source); } catch { throw new Error("An existing JSON file is not a Meridian companion; it was preserved."); }
            if (data?.format !== "meridian-timeline" || data.version !== 1) throw new Error("An existing JSON file is not a Meridian companion; it was preserved.");
            return bytes;
          });
          else if (!file) await this.app.vault.create(jsonPath, bytes);
          else throw new Error("The JSON path is occupied by a folder.");
          snapshot.saved.add(`json:${jsonPath}`);
        } catch (error) { failures.push(`${jsonPath}: ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
    await this.saveSettings();
    if (failures.length) return `Timeline remains available. Saving failed for ${failures.length} file(s): ${failures.join("; ")}. Use Save timeline files to retry without another scan.`;
    return snapshot.mode === "combined" ? `Saved timeline files beside ${snapshot.outputPath}.` : `Saved timeline files for ${targets.length} note(s).`;
  }
  private outputInFlight: Promise<string> | null = null;
  private scopePaths: Set<string> | null = null;
  private scopeRoots: string[] | null = null;
  private scanController: AbortController | null = null;
  private scanInFlight: Promise<TimelineScanResult> | null = null;
  private billingPollTimer: number | null = null;
  private preservedSnapshot?: {id:string;source:string;result:TimelineScanResult;notes:number;revealed:boolean;mode:TimelineMode;paths:string[];allEvents:TimelineEvent[];modified:Record<string,number>;sourceHashes?:Record<string,string>;saved:Set<string>;outputPath?:string};
  async revealSnapshot(): Promise<TimelineScanResult | null> {
const diagnosticEnd1 = diagnostics?.start?.("main.revealSnapshot") ?? (() => {});
try {

    const snapshot=this.preservedSnapshot; if(!snapshot)return null;
    if(!snapshot.revealed) {
      const authorization=await reserveNative({app:this.app,settings:this.settings,persistNative:()=>this.saveSettings()},"meridian-timeline",snapshot.id,snapshot.source,JSON.stringify(snapshot.result),{notes:snapshot.notes},true);
      if(!authorization)return null; snapshot.revealed=true;
    }
    return await (snapshot.result);

} catch (diagnosticError1) { diagnostics?.failure?.("main.revealSnapshot", diagnosticError1); throw diagnosticError1; } finally { diagnosticEnd1(); }
}
  revealedTimeline(): TimelineScanResult | null { return this.preservedSnapshot?.revealed ? this.preservedSnapshot.result : null; }
  releaseView(view: MeridianTimelineView): void { if (this.view !== view) return; this.cancelScan(); this.clearUnrevealedSnapshot(); this.view = null; }
  clearUnrevealedSnapshot():void{if(!this.preservedSnapshot?.revealed)this.preservedSnapshot=undefined;}
  snapshotRevealed(): boolean { return this.preservedSnapshot?.revealed===true; }

  async onload(): Promise<void> {
let diagnosticStartupEnd: () => void = () => {};

const diagnosticEnd2 = diagnostics?.start?.("main.onload") ?? (() => {});
try {

    this.support = new PluginSupport(this, { name: "Meridian Timeline", summary: "Build an interactive chronology from dates already stored in your notes.", quickStart: ["Open Meridian Timeline.", "Let the default date fields scan the vault.", "Filter or save a named view."], commands: ["Open timeline", "Refresh timeline", "Copy diagnostic log"], troubleshooting: ["Use Copy diagnostic log before reporting a problem.", "Check date formats and ignored paths when events are missing."] });
    this.support.start();
    const saved = await this.loadData() as Partial<TimelineSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved, settingsMode: saved?.settingsMode === "advanced" ? "advanced" : "simple", eraLabels: { ...DEFAULT_SETTINGS.eraLabels, ...(saved?.eraLabels ?? {}) }, cache: saved?.cache ?? {}, namedViews: saved?.namedViews ?? [] };
diagnosticStartupEnd = diagnostics?.start?.("startup.initialize") ?? (() => {});

    await recoverNative({app:this.app,settings:this.settings,persistNative:()=>this.saveSettings()});
    if (!this.settings.constanceDeviceId) { this.settings.constanceDeviceId = generateDeviceId(); await this.saveSettings(); }
    this.registerView(VIEW_TYPE_MERIDIAN, (leaf) => { this.view = new MeridianTimelineView(leaf, this); return this.view; });
    registerSidebarIcon(this, VIEW_TYPE_MERIDIAN, "clock-3");
    this.addRibbonIcon("clock-3", "Open Meridian Timeline", () => diagnostics.guard("main.event_1", () => (void diagnostics.guard("main.background_2", () => (this.activateView())))));
    registerTimelineMenus(this, (files, roots, mode) => { void diagnostics.guard("context-menu.open-timeline", () => this.activateView(files, roots, mode)); });
    this.addCommand({ id: "open-timeline", name: "Open timeline", callback: () => this.activateView() });
    this.addCommand({ id: "refresh-timeline", name: "Refresh timeline", callback: () => this.refresh() });
    this.addCommand({ id: "fit-all-events", name: "Fit all timeline events", callback: () => this.view?.fitAll() });
    this.addCommand({ id: "cancel-scan", name: "Cancel timeline scan", callback: () => this.cancelScan() });
    this.addCommand({ id: "save-named-view", name: "Save current timeline view", callback: () => this.view?.saveNamedView() });
    void diagnostics.guard("main.background_3", () => (retryPendingSpendEvents(this).then(() => syncPurchasedUses(this))));
    this.addSettingTab(new MeridianSettingTab(this.app, this));
    this.support.showWelcome();
    this.registerEvent(this.app.vault.on("modify", (file) => {
return diagnostics.guard("main.event_4", () => { if (file instanceof TFile && file.extension.toLowerCase() === "md") this.invalidateAndRefresh(file.path);
});
}));
    this.registerEvent(this.app.vault.on("create", file => this.invalidateAndRefresh(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => diagnostics.guard("main.event_5", () => (this.invalidateAndRefresh(file.path)))));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
return diagnostics.guard("main.event_6", () => {
      if (this.scopeRoots) this.scopeRoots = this.scopeRoots.map(path => path === oldPath ? file.path : path.startsWith(`${oldPath}/`) ? file.path + path.slice(oldPath.length) : path);
      this.app.workspace.requestSaveLayout();
      delete this.settings.cache[oldPath]; this.invalidateAndRefresh(file.path);
});
}));

} catch (diagnosticError2) { diagnostics?.failure?.("main.onload", diagnosticError2); throw diagnosticError2; } finally { diagnosticStartupEnd();  diagnostics?.legacy?.("info", "startup.finished"); diagnosticEnd2(); }
}

  refreshBillingSummary(): void { this.billingSummaryRefresh?.(); }

  onunload(): void {
return diagnostics.guard("main.onunload_7", () => {
const diagnosticAction3 = () => {

    this.cancelScan();
    if (this.billingPollTimer !== null) window.clearInterval(this.billingPollTimer);

}; return diagnostics?.run ? diagnostics.run("main.onunload", diagnosticAction3) : diagnosticAction3();

});
}
  async saveSettings(): Promise<void> {
const diagnosticEnd4 = diagnostics?.start?.("main.saveSettings") ?? (() => {});
try {
 await this.saveData(this.settings);
} catch (diagnosticError4) { diagnostics?.failure?.("main.saveSettings", diagnosticError4); throw diagnosticError4; } finally { diagnosticEnd4(); }
}
  pollAfterCheckout(): void {
    if (this.billingPollTimer !== null) window.clearInterval(this.billingPollTimer);
    let attempts = 0;
    void diagnostics.guard("main.background_8", () => (syncPurchasedUses(this)));
    this.billingPollTimer = window.setInterval(() => {
return diagnostics.guard("main.timer_9", () => {
      attempts += 1;
      void diagnostics.guard("main.background_10", () => (syncPurchasedUses(this)));
      if (attempts >= 6 && this.billingPollTimer !== null) {
        window.clearInterval(this.billingPollTimer);
        this.billingPollTimer = null;
      }

});
}, 15000);
  }
  getScopeRoots(): string[] | null { return this.scopeRoots ? [...this.scopeRoots] : null; }
  restoreScope(roots: string[] | null, mode: TimelineMode = this.timelineMode): boolean {
    const next = roots === null ? null : [...new Set(roots)];
    const changed = JSON.stringify(next) !== JSON.stringify(this.scopeRoots) || mode !== this.timelineMode;
    const pending = this.preservedSnapshot && !this.preservedSnapshot.revealed;
    const journal = (this.settings as TimelineSettings & { operationJournal?: Array<{ event_id: string; retry_of?: string; state: string; app_id: string }> } | undefined)?.operationJournal;
    const attempts = pending ? journal?.filter(item => item.app_id === "meridian-timeline" && (item.event_id === this.preservedSnapshot?.id || item.retry_of === this.preservedSnapshot?.id)) : undefined;
    const denied = Boolean(attempts?.length && attempts.every(item => item.state === "denied"));
    if (changed && (this.outputInFlight || this.scanInFlight || (pending && !denied))) {
      new Notice("Meridian: finish or cancel the current timeline operation before changing its scope.");
      return false;
    }
    if (changed) this.preservedSnapshot = undefined;
    this.timelineMode = mode;
    this.scopeRoots = next;
    this.resolveScope();
    return true;
  }
  private resolveScope(): void {
    if (this.scopeRoots === null) { this.scopePaths = null; return; }
    const entries = this.scopeRoots.map(path => path === "" || path === "/" ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(path)).filter((entry): entry is TAbstractFile => entry !== null);
    this.scopePaths = new Set(selectedFiles(entries, markdownFile).map(file => file.path));
  }
  private async snapshotIsStale(): Promise<boolean> {
    const snapshot = this.preservedSnapshot;
    if (!snapshot?.revealed || this.scanInFlight || this.outputInFlight) return false;
    this.resolveScope();
    const recorded = new Map<string, [number, number]>(JSON.parse(snapshot.source).map(([path, mtime, size]: [string, number, number]) => [path, [mtime, size]]));
    let included = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      if ((this.scopePaths && !this.scopePaths.has(file.path)) || ignoredPath(file.path, this.settings.ignoredFolders, this.settings.ignoredPatterns)) continue;
      const content = await this.app.vault.cachedRead(file);
      if (content.startsWith(GENERATED_NOTE)) continue;
      included++;
      const previousHash = snapshot.sourceHashes?.[file.path];
      if (previousHash !== undefined) {
        if (previousHash !== stableId(timelineSourceText(content))) return true;
        continue;
      }
      const previous = recorded.get(file.path);
      if (!previous) return true;
      const ownWrite = this.settings.generatedNoteStats?.[file.path];
      if (ownWrite && ownWrite.mtime === file.stat.mtime && ownWrite.size === file.stat.size) {
        if (ownWrite.sourceMtime !== previous[0]) return true;
      } else if (file.stat.mtime !== previous[0] || file.stat.size !== previous[1]) return true;
    }
    return included !== recorded.size;
  }
  async activateView(files?: TFile[], roots?: string[], mode?: TimelineMode): Promise<void> {
    const end = diagnostics.start("main.activateView");
    try {
    if (files && !files.length) { new Notice("Meridian: no eligible selected notes."); return; }
    if (!mode) {
      const single = files?.length === 1 && (!roots || roots.length === 1 && roots[0] === files[0].path);
      if (single) mode = "note";
      else { new TimelineModeModal(this.app, choice => { void this.activateView(files, roots, choice); }).open(); return; }
    }
    const nextRoots = files ? roots ?? files.map(file => file.path) : null;
    const scopeChanged = JSON.stringify(nextRoots) !== JSON.stringify(this.scopeRoots) || mode !== this.timelineMode;
    if (!this.restoreScope(nextRoots, mode)) return;
    const active = this.app.workspace.activeLeaf?.view as MarkdownView | undefined;
    if (active?.file && active.getViewType() === "markdown" && active.editor && (!this.scopePaths || this.scopePaths.has(active.file.path))) await active.save();
    const sourceChanged = await this.snapshotIsStale();
    if (sourceChanged) this.preservedSnapshot = undefined;
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MERIDIAN)[0];
    const rescanExisting = existing && !scopeChanged && existing.view instanceof MeridianTimelineView && sourceChanged;
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    // State is restored before scanning, including when Obsidian reloads a deferred tab.
    if (!existing || scopeChanged || !(existing.view instanceof MeridianTimelineView)) await leaf.setViewState({ type: VIEW_TYPE_MERIDIAN, active: true, state: { scopeRoots: nextRoots, timelineMode: mode } });
    await this.app.workspace.revealLeaf(leaf);
    this.view = leaf.view instanceof MeridianTimelineView ? leaf.view : this.view;
    if (rescanExisting && this.view) await this.view.loadTimeline(true);
    } finally { end(); }
  }
  async refresh(): Promise<void> {
const diagnosticEnd6 = diagnostics?.start?.("main.refresh") ?? (() => {});
try {
 await this.view?.loadTimeline(true);
} catch (diagnosticError6) { diagnostics?.failure?.("main.refresh", diagnosticError6); throw diagnosticError6; } finally { diagnosticEnd6(); }
}
  cancelScan(): void {
const diagnosticAction7 = () => {

    const controller = this.scanController;
    controller?.abort();
    this.scanController = null;
    if (controller) this.view?.showScanMessage("Cancelling scan…");

}; return diagnostics?.run ? diagnostics.run("main.cancelScan", diagnosticAction7) : diagnosticAction7();
}
  private invalidateAndRefresh(path: string): void {
    if (this.outputInFlight) return;
    delete this.settings.cache[path];
    this.view?.showScanMessage("Notes changed. Select Refresh to update the timeline (uses one scan).");
  }
  async scan(onProgress: (done: number, total: number) => void): Promise<TimelineScanResult> {
const diagnosticEnd8 = diagnostics?.start?.("main.scan") ?? (() => {});
try {

    if (this.outputInFlight) throw new Error("Timeline files are being saved. Wait for saving to finish before refreshing.");
    if (this.scanInFlight) return await (this.scanInFlight);
    const operation = this.runScan(onProgress);
    this.scanInFlight = operation;
    try { return await operation; } finally { if (this.scanInFlight === operation) this.scanInFlight = null; }

} catch (diagnosticError8) { diagnostics?.failure?.("main.scan", diagnosticError8); throw diagnosticError8; } finally { diagnosticEnd8(); }
}
  private async runScan(onProgress: (done: number, total: number) => void): Promise<TimelineScanResult> {
const diagnosticEnd9 = diagnostics?.start?.("main.runScan") ?? (() => {});
try {

    if(this.preservedSnapshot && !this.preservedSnapshot.revealed) {
      const retried=await this.revealSnapshot();
      if(!retried)throw new Error("Timeline confirmation pending. Reconnect or add credits, then retry.");
      return await (retried);
    }
    const controller = new AbortController(); this.scanController = controller;
    try {
      this.resolveScope();
      if (this.scopePaths?.size === 0) throw new Error("No selected Markdown notes remain. Select an existing note or folder again.");
      const candidates = this.app.vault.getMarkdownFiles().filter((file) => (!this.scopePaths || this.scopePaths.has(file.path)) && !ignoredPath(file.path, this.settings.ignoredFolders, this.settings.ignoredPatterns));
      const files: TFile[] = [];
      for (const candidate of candidates) if (!(await this.app.vault.cachedRead(candidate)).startsWith(GENERATED_NOTE)) files.push(candidate);
      if (!files.length) throw new Error("No eligible Markdown notes remain in this scope. Check ignored folders and select a note or folder again.");
      if(!this.settings.billingAccountLinked || !this.settings.billingAccessToken)throw new Error("Connect your account in plugin settings to create a timeline using your free allowance.");
      const source=JSON.stringify(files.map(f=>[f.path,f.stat.mtime,f.stat.size]));
      const modified: Record<string, number> = {};
      const sourceHashes: Record<string, string> = {};
      const hash = settingsHash(this.settings); const events: TimelineEvent[] = []; const review: CachedNote["review"] = [];
      for (let index = 0; index < files.length; index++) {
        if (controller.signal.aborted) throw new Error("Timeline scan cancelled. No usage was consumed.");
        const file = files[index]; const cached = this.settings.cache[file.path];
        const noteSource = await this.app.vault.cachedRead(file);
        sourceHashes[file.path] = stableId(timelineSourceText(noteSource));
        let result: CachedNote;
        if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size && cached.settingsHash === hash) result = cached;
        else { const parsed = parseNote(file.path, noteSource, this.settings.dateProperties, this.settings.contentPatterns, this.settings.eraLabels); result = { mtime: file.stat.mtime, size: file.stat.size, settingsHash: hash, events: parsed.events, review: parsed.review }; /* New results remain session-memory until useful reveal. */ }
        const ownWrite = this.settings.generatedNoteStats?.[file.path];
        modified[file.path] = ownWrite && ownWrite.mtime === file.stat.mtime && ownWrite.size === file.stat.size ? ownWrite.sourceMtime : file.stat.mtime;
        events.push(...result.events);
        if (this.timelineMode === "combined") events.push(modifiedEvent(file.path, modified[file.path]));
        review.push(...result.review); onProgress(index + 1, files.length);
      }
      if (controller.signal.aborted) throw new Error("Timeline scan cancelled. No usage was consumed.");
      events.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
      const result = { events, review };
      // Meter only after the scan has completed successfully. The in-flight
      // promise above coalesces duplicate opens/refreshes into one operation.
      this.preservedSnapshot={id:jobId(),source,result,notes:files.length,revealed:false,mode:this.timelineMode,paths:files.map(file => file.path),allEvents:events,modified,sourceHashes,saved:new Set()};
      const authorized=await this.revealSnapshot();
      if(!authorized)throw new Error("This timeline is awaiting account confirmation. Reconnect or add credits, then retry this result.");
      return await (authorized);
    } finally {
      if (this.scanController === controller) this.scanController = null;
    }

} catch (diagnosticError9) { diagnostics?.failure?.("main.runScan", diagnosticError9); throw diagnosticError9; } finally { diagnosticEnd9(); }
}
}

class TimelineModeModal extends Modal {
  constructor(app: ConstructorParameters<typeof Modal>[0], private readonly choose: (mode: TimelineMode) => void) { super(app); }
  onOpen(): void {
    this.contentEl.createEl("h2", { text: "Choose timeline type" });
    new Setting(this.contentEl).setName("Combined timeline").setDesc("Combine dates from all selected notes and include file last-modified timestamps.").addButton(button => button.setButtonText("Combined").setCta().onClick(() => { this.close(); this.choose("combined"); }));
    new Setting(this.contentEl).setName("Separate timeline for each note").setDesc("Use only dates within each note. Choose a note in the sidebar to view its timeline.").addButton(button => button.setButtonText("Each note").onClick(() => { this.close(); this.choose("per-note"); }));
  }
}

class SaveViewModal extends Modal {
  private name = "";
  constructor(app: ConstructorParameters<typeof Modal>[0], private readonly onSave: (name: string) => void) { super(app); }
  onOpen(): void {
return diagnostics.guard("main.onOpen_11", () => {
const diagnosticAction10 = () => {
 this.contentEl.createEl("h2", { text: "Save timeline view" }); new Setting(this.contentEl).setName("View name").addText((text) => { text.setPlaceholder("e.g. World history").onChange((value) => {
return diagnostics.guard("main.control_12", () => {
const diagnosticAction11 = () => {
 this.name = value.trim();
}; return diagnostics?.run ? diagnostics.run("control.9906.onChange", diagnosticAction11) : diagnosticAction11();

});
}); text.inputEl.focus(); }); new Setting(this.contentEl).addButton((button) => button.setButtonText("Save").setCta().onClick(() => {
return diagnostics.guard("main.control_13", () => {
const diagnosticAction12 = () => {
 if (this.name) { this.onSave(this.name); this.close(); }
}; return diagnostics?.run ? diagnostics.run("control.save.onClick", diagnosticAction12) : diagnosticAction12();

});
}));
}; return diagnostics?.run ? diagnostics.run("main.onOpen", diagnosticAction10) : diagnosticAction10();

});
}
}

export class MeridianTimelineView extends ItemView {
  private selectedNote = "";
  private plugin: MeridianTimelinePlugin; private events: TimelineEvent[] = []; private review: CachedNote["review"] = []; private filters = emptyFilters(); private groupBy: GroupBy = "folder"; private zoom = 1; private selected: TimelineEvent | null = null; private scanMessage = "";
  private stateLoaded = false;
  private closed = false;
  private resizeObserver?: ResizeObserver;
  private eventLayer!: HTMLElement; private viewport!: HTMLElement; private statusEl!: HTMLElement;
  constructor(leaf: WorkspaceLeaf, plugin: MeridianTimelinePlugin) { super(leaf); this.plugin = plugin; this.groupBy = plugin.settings.groupBy; }
  getViewType(): string { return VIEW_TYPE_MERIDIAN; }
  getDisplayText(): string { return "Meridian Timeline"; }
  getIcon(): string { return "clock-3"; }
  async onOpen(): Promise<void> {
return diagnostics.guard("main.onOpen_14", async () => {
const diagnosticEnd13 = diagnostics?.start?.("main.onOpen") ?? (() => {});
try {
 this.closed = false; this.renderShell();
 this.resizeObserver = new ResizeObserver(() => { if (!this.closed) this.renderEvents(); });
 this.resizeObserver.observe(this.viewport);
} catch (diagnosticError13) { diagnostics?.failure?.("main.onOpen", diagnosticError13); throw diagnosticError13; } finally { diagnosticEnd13(); }

});
}
  getState(): Record<string, unknown> {
    return { timelineMode: this.plugin.getTimelineMode(), scopeRoots: this.plugin.getScopeRoots(), filters: { ...this.filters }, groupBy: this.groupBy, zoom: this.zoom };
  }
  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const value = state && typeof state === "object" ? state as Record<string, unknown> : {};
    const roots = Array.isArray(value.scopeRoots) ? value.scopeRoots.filter((path): path is string => typeof path === "string") : null;
    const before = JSON.stringify([this.plugin.getScopeRoots(), this.plugin.getTimelineMode()]);
    const legacyRoot = value.timelineMode === undefined && roots?.length === 1 ? this.app?.vault.getAbstractFileByPath(roots[0]) : null;
    const mode = value.timelineMode === "per-note" ? "per-note" : value.timelineMode === "note" || legacyRoot && legacyRoot instanceof TFile ? "note" : "combined";
    if (!this.plugin.restoreScope(roots, mode)) return;
    this.filters = emptyFilters();
    if (value.filters && typeof value.filters === "object") for (const key of Object.keys(this.filters) as (keyof FilterState)[]) {
      const filter = (value.filters as Record<string, unknown>)[key];
      if (typeof filter === "string") this.filters[key] = filter;
    }
    this.groupBy = ["none", "folder", "tag", "property"].includes(String(value.groupBy)) ? value.groupBy as GroupBy : this.plugin.settings.groupBy;
    this.zoom = typeof value.zoom === "number" && Number.isFinite(value.zoom) ? Math.max(.5, Math.min(8, value.zoom)) : 1;
    this.selected = null;
    const scan = !this.stateLoaded || before !== JSON.stringify([roots, this.plugin.getTimelineMode()]) || !value.filters;
    this.stateLoaded = true;
    result.history = true;
    if (scan) { this.events = []; this.review = []; this.renderControls(); this.renderEvents(); await this.loadTimeline(); }
    else { this.renderControls(); this.renderEvents(); }
  }
  private async loadNamedView(view: NamedView): Promise<void> {
    const before = JSON.stringify([this.plugin.getScopeRoots(), this.plugin.getTimelineMode()]);
    if (view.scopeRoots !== undefined && !this.plugin.restoreScope(view.scopeRoots, view.timelineMode ?? this.plugin.getTimelineMode())) return;
    this.filters = { search: view.search, folder: view.folder, tag: view.tag, kind: view.kind, uncertainty: view.uncertainty, from: view.from, to: view.to };
    this.groupBy = view.groupBy;
    this.zoom = typeof view.zoom === "number" && Number.isFinite(view.zoom) ? Math.max(.5, Math.min(8, view.zoom)) : 1;
    this.selected = null;
    if (before !== JSON.stringify([this.plugin.getScopeRoots(), this.plugin.getTimelineMode()])) { this.events = []; this.review = []; this.renderControls(); this.renderEvents(); await this.loadTimeline(true); }
    else { this.renderControls(); this.renderEvents(); }
    this.app.workspace.requestSaveLayout();
  }
  async onClose(): Promise<void> {
return diagnostics.guard("main.onClose_15", async () => {
const diagnosticEnd14 = diagnostics?.start?.("main.onClose") ?? (() => {});
try {
 this.closed = true; this.resizeObserver?.disconnect(); this.plugin.releaseView(this);
} catch (diagnosticError14) { diagnostics?.failure?.("main.onClose", diagnosticError14); throw diagnosticError14; } finally { diagnosticEnd14(); }

});
}
  showScanMessage(message: string): void { this.scanMessage = message; if (this.statusEl) this.statusEl.setText(message); }
  async loadTimeline(force = false): Promise<void> {
const diagnosticEnd15 = diagnostics?.start?.("main.loadTimeline") ?? (() => {});
try {

    if (!this.statusEl || this.closed) return;
    this.showScanMessage(force ? "Refreshing timeline…" : "Scanning selected scope…");
    try {
      const result = (!force && this.plugin.revealedTimeline()) || await this.plugin.scan((done, total) => this.showScanMessage(`Scanning notes: ${done}/${total}`));
      if (this.closed) return;
      this.events = result.events; this.review = result.review; await this.plugin.saveSettings(); this.renderControls(); this.renderEvents();
      let saved: string;
      try { saved = await this.plugin.saveTimelineOutputs(); }
      catch (error) { saved = `Timeline remains available. Saving failed: ${error instanceof Error ? error.message : String(error)}. Use Save timeline files to retry.`; }
      this.showScanMessage(`${saved} Timeline ready: ${this.events.length} event(s) in ${this.plugin.getScopeRoots() === null ? "the whole vault" : "the selected scope"}. Your free credits are used first, then purchased credits; viewing this snapshot again uses no extra credits.`);
    } catch (error) {
diagnostics.failure("main.caught_16", error); this.showScanMessage(error instanceof Error ? error.message : "Timeline scan failed."); }

} catch (diagnosticError15) { diagnostics?.failure?.("main.loadTimeline", diagnosticError15); throw diagnosticError15; } finally { diagnosticEnd15(); }
}
  fitAll(): void { this.zoom = 1; this.renderEvents(); }
  saveNamedView(): void { if(!this.plugin.snapshotRevealed()){new Notice("Open the full timeline before saving. Keep this view open while signing in.");return;} new SaveViewModal(this.app, (name) => { const view: NamedView = { name, ...this.filters, groupBy: this.groupBy, zoom: this.zoom, scopeRoots: this.plugin.getScopeRoots(), timelineMode: this.plugin.getTimelineMode() }; this.plugin.settings.namedViews = [...this.plugin.settings.namedViews.filter((item) => item.name !== name), view]; void diagnostics.guard("main.background_17", () => (this.plugin.saveSettings())); new Notice(`Meridian saved “${name}”.`); this.renderControls(); }).open(); }
  private renderShell(): void {
const diagnosticAction16 = () => {

    const root = this.contentEl; root.empty(); root.addClass("meridian-root");
    const heading = root.createDiv("meridian-header"); const title = heading.createDiv(); title.createEl("h1", { text: "Meridian Timeline" }); title.createEl("p", { text: "A local, readable chronology of your notes." });
    const actions = heading.createDiv("meridian-actions");
    actions.createEl("button", { text: "Save timeline files" }).addEventListener("click", () => { void this.plugin.saveTimelineOutputs().then(message => this.showScanMessage(message)).catch(error => this.showScanMessage(`Timeline remains available. Saving failed: ${error instanceof Error ? error.message : String(error)}. Use Save timeline files to retry without another scan.`)); });  actions.createEl("button", { text: "Refresh" }).addEventListener("click", () => diagnostics.guard("main.event_18", () => (void diagnostics.guard("main.background_19", () => (this.loadTimeline(true)))))); actions.createEl("button", { text: "Fit all" }).addEventListener("click", () => diagnostics.guard("main.event_20", () => (this.fitAll()))); actions.createEl("button", { text: "Zoom −" }).addEventListener("click", () => {
return diagnostics.guard("main.event_21", () => { this.zoom = Math.max(.5, this.zoom / 1.25); this.renderEvents();
});
}); actions.createEl("button", { text: "Zoom +" }).addEventListener("click", () => {
return diagnostics.guard("main.event_22", () => { this.zoom = Math.min(8, this.zoom * 1.25); this.renderEvents();
});
}); actions.createEl("button", { text: "Focus selected" }).addEventListener("click", () => diagnostics.guard("main.event_23", () => (this.focusSelected()))); actions.createEl("button", { text: "Save view" }).addEventListener("click", () => diagnostics.guard("main.event_24", () => (this.saveNamedView())));
    this.renderControls();
    root.createDiv("meridian-summary");
    const info = root.createDiv("meridian-info"); info.setText("Blue: dated events · Green: spans · Orange: approximate · Yellow: uncertain · Violet: file modified. Click an event to open its source note.");
    this.viewport = root.createDiv("meridian-viewport"); this.viewport.setAttribute("role", "region"); this.viewport.setAttribute("aria-label", "Interactive timeline"); this.eventLayer = this.viewport.createDiv("meridian-event-layer");
    this.statusEl = root.createDiv("meridian-status"); this.statusEl.setAttribute("role", "status");
    root.createDiv("meridian-review");

}; return diagnostics?.run ? diagnostics.run("main.renderShell", diagnosticAction16) : diagnosticAction16();
}
  private renderControls(): void {
const diagnosticAction17 = () => {

    const root = this.contentEl; const old = root.querySelector(".meridian-controls"); old?.remove(); const controls = root.createDiv("meridian-controls");
    const header = root.querySelector(".meridian-header"); if (header) header.after(controls);
    if (this.plugin.getTimelineMode() === "per-note") {
      const paths = this.plugin.snapshotPaths();
      if (!paths.includes(this.selectedNote)) this.selectedNote = paths[0] ?? "";
      const note = controls.createEl("select"); note.setAttribute("aria-label", "Individual note timeline");
      paths.forEach(path => note.createEl("option", { value: path, text: path })); note.value = this.selectedNote;
      note.addEventListener("change", () => { this.selectedNote = note.value; this.renderEvents(); });
    }
    const text = controls.createEl("input", { type: "search", placeholder: "Search title, path, heading…", value: this.filters.search }); text.setAttribute("aria-label", "Search timeline"); text.addEventListener("input", () => {
return diagnostics.guard("main.event_25", () => { this.filters.search = text.value; this.renderEvents();
});
});
    const folder = controls.createEl("select"); folder.setAttribute("aria-label", "Filter by folder"); folder.createEl("option", { value: "", text: "All folders" }); [...new Set(this.events.map((event) => event.folder).filter(Boolean))].sort().forEach((value) => folder.createEl("option", { value, text: value })); folder.value = this.filters.folder; folder.addEventListener("change", () => {
return diagnostics.guard("main.event_26", () => { this.filters.folder = folder.value; this.renderEvents();
});
});
    const kind = controls.createEl("select"); kind.setAttribute("aria-label", "Filter by event type"); kind.createEl("option", { value: "", text: "All event types" }); ["point", "span", "approximate", "uncertain"].forEach((value) => kind.createEl("option", { value, text: value[0].toUpperCase() + value.slice(1) })); kind.value = this.filters.kind; kind.addEventListener("change", () => {
return diagnostics.guard("main.event_27", () => { this.filters.kind = kind.value; this.renderEvents();
});
});
    const tag = controls.createEl("input", { placeholder: "Tag", value: this.filters.tag }); tag.setAttribute("aria-label", "Filter by tag"); tag.addEventListener("input", () => {
return diagnostics.guard("main.event_28", () => { this.filters.tag = tag.value; this.renderEvents();
});
});
    if (this.plugin.settings.namedViews.length) { const saved = controls.createEl("select"); saved.setAttribute("aria-label", "Saved timeline view"); saved.createEl("option", { value: "", text: "Saved views…" }); this.plugin.settings.namedViews.forEach((view) => saved.createEl("option", { value: view.name, text: view.name })); saved.addEventListener("change", () => {
return diagnostics.guard("main.event_29", () => { const view = this.plugin.settings.namedViews.find((item) => item.name === saved.value); if (!view) return; void diagnostics.guard("timeline.load-named-view", () => this.loadNamedView(view));
});
}); }
    const group = controls.createEl("select"); group.setAttribute("aria-label", "Group events by"); [["none", "No grouping"], ["folder", "Folder"], ["tag", "Tag"], ["property", "Date property"]].forEach(([value, textValue]) => group.createEl("option", { value, text: textValue })); group.value = this.groupBy; group.addEventListener("change", () => {
return diagnostics.guard("main.event_30", () => { this.groupBy = group.value as GroupBy; this.renderEvents();
});
});
    const uncertainty = controls.createEl("label"); const checkbox = uncertainty.createEl("input", { type: "checkbox" }); checkbox.checked = this.filters.uncertainty === "uncertain"; uncertainty.appendText(" uncertain only"); checkbox.addEventListener("change", () => {
return diagnostics.guard("main.event_31", () => { this.filters.uncertainty = checkbox.checked ? "uncertain" : ""; this.renderEvents();
});
});

}; return diagnostics?.run ? diagnostics.run("main.renderControls", diagnosticAction17) : diagnosticAction17();
}
  private renderEvents(): void {
const diagnosticAction18 = () => {

    if (!this.eventLayer) return; this.eventLayer.empty();
    this.app.workspace.requestSaveLayout();
    const visible = this.events.filter(event => this.plugin.getTimelineMode() !== "per-note" || event.sourcePath === this.selectedNote).filter((event) => matchesFilters(event, this.filters)).slice(0, this.plugin.settings.maxEvents);
    const summary = this.contentEl.querySelector(".meridian-summary");
    if (summary) {
      const mode = this.plugin.getTimelineMode();
      summary.textContent = `${mode === "per-note" ? "Individual note" : mode === "note" ? "Single note" : "Combined timeline"} · ${visible.length.toLocaleString()} shown${this.events.length > visible.length ? ` of ${this.events.length.toLocaleString()} events` : ""}${mode === "per-note" && this.selectedNote ? ` · ${this.selectedNote}` : ""}`;
    }
    if (!visible.length) {
      const message = this.events.length ? "No events match this note and its filters." : !this.plugin.snapshotRevealed() ? "The timeline has not been authorized yet. See the status below and retry with Refresh." : "No supported dates were found in this note. Check its date properties or content.";
      this.eventLayer.createDiv("meridian-empty").setText(message); this.renderReview(); return;
    }
    const min = Math.min(...visible.map((event) => event.start)); const max = Math.max(...visible.map((event) => Math.max(event.end, event.start + 86400000))); const range = Math.max(max - min, 86400000); const width = Math.max(240, (this.viewport.clientWidth || 800) * this.zoom); this.eventLayer.style.width = `${width}px`;
    const usableWidth = width - 180;
    const axis = this.eventLayer.createDiv("meridian-axis"); for (const { position, label } of axisTicks(min, range, usableWidth)) { const tick = axis.createDiv("meridian-tick"); tick.style.left = `${position}px`; tick.textContent = label; }
    let maxLane = 0;
    for (const { event, lane } of layoutEvents(visible, this.groupBy, range * width / usableWidth, width, 184)) { const eventEnd = Math.max(event.end, event.start + 86400000); maxLane = Math.max(maxLane, lane); const x = ((event.start - min) / range) * usableWidth; const w = event.end > event.start ? Math.max(180, ((eventEnd - event.start) / range) * usableWidth) : 180; const button = this.eventLayer.createEl("button", { cls: `meridian-event meridian-${event.kind}${event.sourceProperty === "file-modified" ? " meridian-modified" : ""}${event.openEnded ? " meridian-open-ended" : ""}`, attr: { type: "button", "aria-label": `${event.title}, ${event.startLabel}${event.endLabel ? ` to ${event.endLabel}` : ""}${event.openEnded ? ", open ended" : ""}` } }); button.dataset.eventId = event.id; button.style.left = `${x}px`; button.style.width = `${w}px`; button.style.top = `${44 + lane * 68}px`; button.title = `${event.title} — ${event.startLabel}${event.endLabel ? ` → ${event.endLabel}` : event.openEnded ? " (open ended)" : ""}`; button.createSpan({ cls: "meridian-event-title", text: event.title }); button.createSpan({ cls: "meridian-event-date", text: event.sourceProperty === "file-modified" ? `${event.startLabel.slice(0, 10)} · Modified (UTC)` : `${event.startLabel}${event.endLabel ? ` → ${event.endLabel}` : event.openEnded ? " → ongoing" : ""}` }); if (event.uncertain) button.createSpan({ cls: "meridian-badge", text: "?" }); button.addEventListener("click", () => diagnostics.guard("main.event_32", () => (void diagnostics.guard("main.background_33", () => (this.openEvent(event)))))); }
    this.eventLayer.style.height = `${100 + (maxLane + 1) * 68}px`; this.renderReview();

}; return diagnostics?.run ? diagnostics.run("main.renderEvents", diagnosticAction18) : diagnosticAction18();
}
  private groupKey(event: TimelineEvent): string { if (this.groupBy === "folder") return event.folder || "Vault root"; if (this.groupBy === "tag") return event.tags[0] || "Untagged"; return "All events"; }
  private focusSelected(): void { if (!this.selected) { new Notice("Select an event first."); return; } const el = this.eventLayer.querySelector(`[data-event-id="${CSS.escape(this.selected.id)}"]`); if (el instanceof HTMLElement) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); }
  private async openEvent(event: TimelineEvent): Promise<void> {
const diagnosticEnd19 = diagnostics?.start?.("main.openEvent") ?? (() => {});
try {
 this.selected = event;
 if (event.sourceLine !== undefined) {
   const file = this.app.vault.getAbstractFileByPath(event.sourcePath);
   if (file instanceof TFile) {
     const leaf = this.app.workspace.getLeaf(false);
     await leaf.openFile(file, { eState: { line: event.sourceLine } });
     const editor = (leaf.view as MarkdownView | undefined)?.editor;
     const position = { line: event.sourceLine, ch: 0 };
     editor?.setCursor(position);
     editor?.scrollIntoView({ from: position, to: position }, true);
     return;
   }
 }
 const subpath = event.heading ? `#${event.heading}` : event.block ? `#${event.block}` : ""; await this.app.workspace.openLinkText(`${event.sourcePath}${subpath}`, "", false); new Notice(`Opened ${event.title}.`);
} catch (diagnosticError19) { diagnostics?.failure?.("main.openEvent", diagnosticError19); throw diagnosticError19; } finally { diagnosticEnd19(); }
}
  private renderReview(): void {
const diagnosticAction20 = () => {
 const box = this.contentEl.querySelector(".meridian-review"); if (!(box instanceof HTMLElement)) return; box.empty(); const review = this.review.filter(item => this.plugin.getTimelineMode() !== "per-note" || item.path === this.selectedNote); if (!review.length) return; box.createEl("h2", { text: `Review (${review.length})` }); const list = box.createEl("ul"); review.slice(0, 50).forEach((item) => { const li = list.createEl("li"); li.createEl("button", { text: item.title }).addEventListener("click", () => diagnostics.guard("main.event_34", () => (void diagnostics.guard("main.background_35", () => (this.app.workspace.openLinkText(item.path, "", false)))))); li.appendText(` — ${item.detail}`); }); if (review.length > 50) box.createEl("p", { text: `Showing 50 of ${review.length} review items.` });
}; return diagnostics?.run ? diagnostics.run("main.renderReview", diagnosticAction20) : diagnosticAction20();
}
}

function yearLabel(timestamp: number): string { const year = new Date(timestamp).getUTCFullYear(); return year < 0 ? `${Math.abs(year)} BCE` : String(year); }

export class MeridianSettingTab extends PluginSettingTab {
  constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], private readonly plugin: MeridianTimelinePlugin) { super(app, plugin); }
  display(): void {
return diagnostics.guard("main.display_36", () => {
const diagnosticAction21 = () => {

    const { containerEl } = this; const diagnosticStage22 = diagnostics?.start?.("settings.render.clear") ?? (() => {});
containerEl.empty();
diagnosticStage22();

    const diagnosticStage23 = diagnostics?.start?.("settings.render.help") ?? (() => {});
this.plugin.support.addHelpSetting(containerEl);
diagnosticStage23();

this.plugin.support.addDebugSetting?.(containerEl);

    const advanced = this.plugin.settings.settingsMode === "advanced";
    const diagnosticStage24 = diagnostics?.start?.("settings.render.settings_mode") ?? (() => {});
new Setting(containerEl).setName("Settings mode").setDesc("Simple shows everyday settings. Advanced adds scan rules, limits, and diagnostics.").addDropdown((dropdown) => dropdown.addOptions({ simple: "Simple", advanced: "Advanced — optional" }).setValue(advanced ? "advanced" : "simple").onChange(async (value) => {
return diagnostics.guard("main.control_37", async () => {
const diagnosticEnd50 = diagnostics?.start?.("control.settings_mode.onChange") ?? (() => {});
try {
 this.plugin.settings.settingsMode = value === "advanced" ? "advanced" : "simple"; await this.plugin.saveSettings(); this.display();
} catch (diagnosticError50) { diagnostics?.failure?.("control.settings_mode.onChange", diagnosticError50); throw diagnosticError50; } finally { diagnosticEnd50(); }

});
}));
diagnosticStage24();

    const diagnosticStage25 = diagnostics?.start?.("settings.render.stage_1") ?? (() => {});
if (advanced) this.plugin.support.addDiagnosticsSetting(containerEl);
diagnosticStage25();
 const diagnosticStage26 = diagnostics?.start?.("settings.render.stage_2") ?? (() => {});
containerEl.createEl("h2", { text: "Meridian Timeline" });
diagnosticStage26();
 const diagnosticStage27 = diagnostics?.start?.("settings.render.stage_3") ?? (() => {});
containerEl.createEl("p", { text: "Meridian reads notes locally. Saving appends a marked Markdown section by default; JSON companions are optional. Structured frontmatter is preferred; content scanning is a fallback." });
diagnosticStage27();

    const preview = containerEl.createDiv("meridian-settings-preview"); const diagnosticStage28 = diagnostics?.start?.("settings.render.stage_4") ?? (() => {});
preview.createEl("h3", { text: "Quick preview" });
diagnosticStage28();
 const diagnosticStage29 = diagnostics?.start?.("settings.render.stage_5") ?? (() => {});
preview.createEl("p", { text: "Exact dates appear as solid bars; approximate dates use a dashed edge; uncertain/conflicting dates carry a question badge." });
diagnosticStage29();
 const sample = preview.createDiv("meridian-preview-bars"); const diagnosticStage30 = diagnostics?.start?.("settings.render.stage_6") ?? (() => {});
sample.createDiv("meridian-preview-bar meridian-preview-exact").setText("Exact");
diagnosticStage30();
 const diagnosticStage31 = diagnostics?.start?.("settings.render.stage_7") ?? (() => {});
sample.createDiv("meridian-preview-bar meridian-preview-approx").setText("Approximate");
diagnosticStage31();
 const diagnosticStage32 = diagnostics?.start?.("settings.render.stage_8") ?? (() => {});
sample.createDiv("meridian-preview-bar meridian-preview-uncertain").setText("Uncertain?");
diagnosticStage32();

    new Setting(containerEl).setName("Append timeline as Markdown").setDesc("Enabled by default. Save individual timelines in their source notes; save combined timelines in a dedicated note. Refresh updates the marked section.").addToggle(toggle => toggle.setValue(this.plugin.settings.appendTimelineMarkdown).onChange(value => diagnostics.guard("settings.append-timeline", async () => {
      const previous = this.plugin.settings.appendTimelineMarkdown;
      this.plugin.settings.appendTimelineMarkdown = value;
      try { await this.plugin.saveSettings(); } catch (error) { this.plugin.settings.appendTimelineMarkdown = previous; toggle.setValue(previous); throw error; }
    })));
    new Setting(containerEl).setName("Save companion JSON").setDesc("Off by default. Save a .meridian-timeline.json file beside each timeline note, even when Markdown saving is disabled.").addToggle(toggle => toggle.setValue(this.plugin.settings.saveTimelineJson).onChange(value => diagnostics.guard("settings.save-timeline-json", async () => {
      const previous = this.plugin.settings.saveTimelineJson;
      this.plugin.settings.saveTimelineJson = value;
      try { await this.plugin.saveSettings(); } catch (error) { this.plugin.settings.saveTimelineJson = previous; toggle.setValue(previous); throw error; }
    })));
    const diagnosticStage33 = diagnostics?.start?.("settings.render.date_properties") ?? (() => {});
new Setting(containerEl).setName("Date properties").setDesc("Comma-separated properties in priority order; for example date, start, end. Use ISO dates such as 2026-09-30 in notes.").addText((text) => text.setValue(this.plugin.settings.dateProperties.join(", ")).onChange(async (value) => {
return diagnostics.guard("main.control_38", async () => {
const diagnosticEnd51 = diagnostics?.start?.("control.date_properties.onChange") ?? (() => {});
try {
 this.plugin.settings.dateProperties = value.split(",").map((item) => item.trim()).filter(Boolean); await this.plugin.saveSettings();
} catch (diagnosticError51) { diagnostics?.failure?.("control.date_properties.onChange", diagnosticError51); throw diagnosticError51; } finally { diagnosticEnd51(); }

});
}));
diagnosticStage33();

    const diagnosticStage34 = diagnostics?.start?.("settings.render.content_patterns") ?? (() => {});
if (advanced) new Setting(containerEl).setName("Content patterns").setDesc("Optional regular expressions. Capture the date in group 1; malformed expressions are reported in Review.").addTextArea((text) => text.setValue(this.plugin.settings.contentPatterns.join("\n")).onChange(async (value) => {
return diagnostics.guard("main.control_39", async () => {
const diagnosticEnd52 = diagnostics?.start?.("control.content_patterns.onChange") ?? (() => {});
try {
 this.plugin.settings.contentPatterns = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); await this.plugin.saveSettings();
} catch (diagnosticError52) { diagnostics?.failure?.("control.content_patterns.onChange", diagnosticError52); throw diagnosticError52; } finally { diagnosticEnd52(); }

});
}));
diagnosticStage34();

    const diagnosticStage35 = diagnostics?.start?.("settings.render.era_labels") ?? (() => {});
if (advanced) new Setting(containerEl).setName("Era labels").setDesc("One label=year per line, for example ‘Renaissance=1400’.").addTextArea((text) => text.setValue(Object.entries(this.plugin.settings.eraLabels).map(([key, value]) => `${key}=${value}`).join("\n")).onChange(async (value) => {
return diagnostics.guard("main.control_40", async () => {
const diagnosticEnd53 = diagnostics?.start?.("control.era_labels.onChange") ?? (() => {});
try {
 const eras: Record<string, number> = {}; for (const line of value.split(/\r?\n/)) { const [key, raw] = line.split("="); const year = Number(raw); if (key?.trim() && Number.isFinite(year)) eras[key.trim()] = year; } this.plugin.settings.eraLabels = eras; await this.plugin.saveSettings();
} catch (diagnosticError53) { diagnostics?.failure?.("control.era_labels.onChange", diagnosticError53); throw diagnosticError53; } finally { diagnosticEnd53(); }

});
}));
diagnosticStage35();

    const diagnosticStage36 = diagnostics?.start?.("settings.render.ignored_folders") ?? (() => {});
new Setting(containerEl).setName("Ignored folders").setDesc("Comma-separated vault-relative folders.").addText((text) => text.setValue(this.plugin.settings.ignoredFolders.join(", ")).onChange(async (value) => {
return diagnostics.guard("main.control_41", async () => {
const diagnosticEnd54 = diagnostics?.start?.("control.ignored_folders.onChange") ?? (() => {});
try {
 this.plugin.settings.ignoredFolders = value.split(",").map((item) => item.trim()).filter(Boolean); await this.plugin.saveSettings();
} catch (diagnosticError54) { diagnostics?.failure?.("control.ignored_folders.onChange", diagnosticError54); throw diagnosticError54; } finally { diagnosticEnd54(); }

});
}));
diagnosticStage36();

    const diagnosticStage37 = diagnostics?.start?.("settings.render.ignored_note_patterns") ?? (() => {});
if (advanced) new Setting(containerEl).setName("Ignored note patterns").setDesc("Optional regular expressions matched against vault paths.").addTextArea((text) => text.setValue(this.plugin.settings.ignoredPatterns.join("\n")).onChange(async (value) => {
return diagnostics.guard("main.control_42", async () => {
const diagnosticEnd55 = diagnostics?.start?.("control.ignored_note_patterns.onChange") ?? (() => {});
try {
 this.plugin.settings.ignoredPatterns = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); await this.plugin.saveSettings();
} catch (diagnosticError55) { diagnostics?.failure?.("control.ignored_note_patterns.onChange", diagnosticError55); throw diagnosticError55; } finally { diagnosticEnd55(); }

});
}));
diagnosticStage37();

    const diagnosticStage38 = diagnostics?.start?.("settings.render.maximum_events") ?? (() => {});
if (advanced) new Setting(containerEl).setName("Maximum events").setDesc("Limit rendered events to keep large vaults responsive. 5,000 is recommended; Review still reports all scanned notes.").addDropdown((dropdown) => dropdown.addOptions({ [String(this.plugin.settings.maxEvents)]: `${this.plugin.settings.maxEvents.toLocaleString()} · current`, "1000": "1,000 · lighter", "5000": "5,000 · recommended", "10000": "10,000 · large vault", "50000": "50,000 · demanding" }).setValue(String(this.plugin.settings.maxEvents)).onChange(async (value) => {
return diagnostics.guard("main.control_43", async () => {
const diagnosticEnd56 = diagnostics?.start?.("control.maximum_events.onChange") ?? (() => {});
try {
 this.plugin.settings.maxEvents = Number(value); await this.plugin.saveSettings();
} catch (diagnosticError56) { diagnostics?.failure?.("control.maximum_events.onChange", diagnosticError56); throw diagnosticError56; } finally { diagnosticEnd56(); }

});
}));
diagnosticStage38();

    const diagnosticStage39 = diagnostics?.start?.("settings.render.billing") ?? (() => {});
new Setting(containerEl).setName("Billing").setHeading();
diagnosticStage39();
 const diagnosticStage40 = diagnostics?.start?.("settings.render.stage_9") ?? (() => {});
containerEl.createEl("p",{text:"Verified accounts receive five free timeline credits on their account. Each credit covers up to 20 notes; larger timelines use more credits. Free credits are used first. Viewing or saving an existing timeline uses no additional credits."});
diagnosticStage40();

    const balanceSummary = containerEl.createEl("p", { cls: "meridian-billing-summary", attr: { role: "status", "aria-live": "polite" } });
    const renderBalanceSummary = () => { const diagnosticAction57 = () => (balanceSummary.setText(!this.plugin.settings.billingAccountLinked || !this.plugin.settings.billingAccessToken ? "Create an account or sign in, then Connect to load your free and purchased credits." : `Timeline credits remaining: ${(freeUsesRemaining(localDateKey(), this.plugin.settings.freeUsesDate, this.plugin.settings.freeUsesToday) + Math.max(0, this.plugin.settings.purchasedUses)).toLocaleString()} (${freeUsesRemaining(localDateKey(), this.plugin.settings.freeUsesDate, this.plugin.settings.freeUsesToday)} free + ${Math.max(0, this.plugin.settings.purchasedUses).toLocaleString()} purchased)`)); return diagnostics?.run ? diagnostics.run("main.renderBalanceSummary", diagnosticAction57) : diagnosticAction57(); };
    const diagnosticStage41 = diagnostics?.start?.("settings.render.stage_10") ?? (() => {});
this.plugin.billingSummaryRefresh = renderBalanceSummary;
diagnosticStage41();

    const diagnosticStage42 = diagnostics?.start?.("settings.render.stage_11") ?? (() => {});
renderBalanceSummary();
diagnosticStage42();

    const diagnosticStage43 = diagnostics?.start?.("settings.render.account") ?? (() => {});
addBillingAccountSettings(containerEl, { state: this.plugin.settings, appId: "meridian-timeline", installationId: this.plugin.settings.constanceDeviceId, syncBalance: () => syncPurchasedUses(this.plugin), persist: () => this.plugin.saveSettings(), refresh: () => this.display() });
diagnosticStage43();

    const diagnosticStage44 = diagnostics?.start?.("settings.render.catalog") ?? (() => {});
void diagnostics.guard("main.background_44", () => (renderNativePacks(containerEl,{app:this.app,settings:this.plugin.settings,persistNative:()=>this.plugin.saveSettings()},"meridian-timeline",async plan=>{
const diagnosticEnd58 = diagnostics?.start?.("main.background.27388") ?? (() => {});
try {
const {openAccountCheckoutByPrice}=await import("./billing-checkout");await openAccountCheckoutByPrice({state:this.plugin.settings,appId:"meridian-timeline",installationId:this.plugin.settings.constanceDeviceId,persist:()=>this.plugin.saveSettings(),syncBalance:()=>syncPurchasedUses(this.plugin),refreshSession:async()=>{
const diagnosticEnd59 = diagnostics?.start?.("main.background.27713") ?? (() => {});
try {
const a=await import("./constance-account");return await (a.refreshBillingSession(this.plugin.settings,()=>this.plugin.saveSettings()));
} catch (diagnosticError59) { diagnostics?.failure?.("main.background.27713", diagnosticError59); throw diagnosticError59; } finally { diagnosticEnd59(); }
}},plan);
} catch (diagnosticError58) { diagnostics?.failure?.("main.background.27388", diagnosticError58); throw diagnosticError58; } finally { diagnosticEnd58(); }
})));
diagnosticStage44();

    const diagnosticStage45 = diagnostics?.start?.("settings.render.refresh_purchased_balance") ?? (() => {});
new Setting(containerEl).setName("Refresh balance").addButton((button) => button.setButtonText("Refresh").onClick(async () => {
return diagnostics.guard("main.control_45", async () => {
const diagnosticEnd60 = diagnostics?.start?.("control.refresh_purchased_balance.onClick") ?? (() => {});
try {
 button.setDisabled(true); button.setButtonText("Refreshing…"); try { await syncPurchasedUses(this.plugin, true); this.display(); } catch (caughtError46) {
diagnostics.failure("main.caught_47", caughtError46); new Notice("Balance could not be refreshed. Check your connection and retry."); } finally { button.setDisabled(false); button.setButtonText("Refresh"); }
} catch (diagnosticError60) { diagnostics?.failure?.("control.refresh_purchased_balance.onClick", diagnosticError60); throw diagnosticError60; } finally { diagnosticEnd60(); }

});
}));
diagnosticStage45();

    const diagnosticStage46 = diagnostics?.start?.("settings.render.privacy_and_threat_model") ?? (() => {});
if (advanced) new Setting(containerEl).setName("Privacy").setHeading();
diagnosticStage46();
 const diagnosticStage47 = diagnostics?.start?.("settings.render.stage_12") ?? (() => {});
containerEl.createEl("p", { text: "Notes are read on your device and are never uploaded or edited. Saved timeline data includes note paths, titles, and dates. Account and purchase requests use the account service." });
diagnosticStage47();

    const diagnosticStage48 = diagnostics?.start?.("settings.render.named_views") ?? (() => {});
if (advanced) new Setting(containerEl).setName("Named views").setHeading();
diagnosticStage48();
 const diagnosticStage49 = diagnostics?.start?.("settings.render.stage_13") ?? (() => {});
this.plugin.settings.namedViews.forEach((view) => new Setting(containerEl).setName(view.name).setDesc(`${view.search || "All notes"} · ${view.groupBy}`).addButton((button) => button.setButtonText("Delete").setWarning().onClick(async () => {
return diagnostics.guard("main.control_48", async () => {
const diagnosticEnd61 = diagnostics?.start?.("control.delete.onClick") ?? (() => {});
try {
 this.plugin.settings.namedViews = this.plugin.settings.namedViews.filter((item) => item.name !== view.name); await this.plugin.saveSettings(); this.display();
} catch (diagnosticError61) { diagnostics?.failure?.("control.delete.onClick", diagnosticError61); throw diagnosticError61; } finally { diagnosticEnd61(); }

});
})));
diagnosticStage49();


}; return diagnostics?.run ? diagnostics.run("settings.open", diagnosticAction21) : diagnosticAction21();

});
}

  hide(): void { const end = diagnostics?.start?.("settings.close") ?? (() => {}); try { super.hide(); } finally { end(); } }
}
