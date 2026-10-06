import { Menu, Plugin, TFile } from "obsidian";
import { selectedFiles, markdownFile } from "./selection-scope";

/** Build timelines from exactly the selected Markdown scope, recursively for folders. */
export function registerTimelineMenus(plugin: Plugin, open: (files: TFile[], roots: string[], mode: "note" | "combined" | "per-note") => void): void {
  const add = (menu: Menu, files: TFile[], roots: string[], singleNote = false): void => {
    if (!files.length) return;
    if (singleNote) menu.addItem(item => item.setTitle("Meridian: Timeline from this note").setIcon("clock-3").onClick(() => open(files, roots, "note")));
    else {
      menu.addItem(item => item.setTitle("Meridian: Combined timeline (including file modified dates)").setIcon("clock-3").onClick(() => open(files, roots, "combined")));
      menu.addItem(item => item.setTitle("Meridian: Separate timeline for each note").setIcon("clock-3").onClick(() => open(files, roots, "per-note")));
    }
  };
  plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, entry) => add(menu, selectedFiles([entry], markdownFile), [entry.path], entry instanceof TFile)));
  plugin.registerEvent(plugin.app.workspace.on("files-menu", (menu, entries) => add(menu, selectedFiles(entries, markdownFile), [...new Set(entries.map(entry => entry.path))])));
  plugin.registerEvent(plugin.app.workspace.on("editor-menu", (menu, _editor, info) => {
    if (info?.file instanceof TFile && markdownFile(info.file)) add(menu, [info.file], [info.file.path], true);
  }));
}
