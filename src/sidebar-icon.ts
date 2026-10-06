import { Plugin, setIcon, WorkspaceLeaf } from "obsidian";

/** Supply icon metadata for restored tabs without loading or revealing their views. */
export function registerSidebarIcon(plugin: Plugin, viewType: string, icon: string): void {
  const refresh = (): void => {
    for (const leaf of plugin.app.workspace.getLeavesOfType(viewType)) {
      if (leaf.view.icon === icon) continue;
      leaf.view.icon = icon;
      // Obsidian exposes this header element at runtime; guard older/mobile layouts.
      const header = (leaf as WorkspaceLeaf & { tabHeaderInnerIconEl?: HTMLElement }).tabHeaderInnerIconEl;
      if (header) setIcon(header, icon);
    }
  };
  plugin.app.workspace.onLayoutReady(refresh);
  plugin.registerEvent(plugin.app.workspace.on("layout-change", refresh));
}
