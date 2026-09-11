import type { TimelineEvent } from "./types";

export interface FilterState { search: string; folder: string; tag: string; kind: string; uncertainty: string; from: string; to: string; }

export function matchesFilters(event: TimelineEvent, filters: FilterState): boolean {
  const needle = filters.search.trim().toLowerCase();
  if (needle && ![event.title, event.sourcePath, event.heading ?? "", event.description ?? ""].join(" ").toLowerCase().includes(needle)) return false;
  if (filters.folder && event.folder !== filters.folder) return false;
  if (filters.tag && !event.tags.includes(filters.tag.replace(/^#/, ""))) return false;
  if (filters.kind && event.kind !== filters.kind) return false;
  if (filters.uncertainty === "uncertain" && !event.uncertain && !event.approximate) return false;
  const from = filters.from ? Date.parse(filters.from) : Number.NEGATIVE_INFINITY;
  const to = filters.to ? Date.parse(filters.to) : Number.POSITIVE_INFINITY;
  return event.end >= from && event.start <= to;
}

export function ignoredPath(path: string, folders: string[], patterns: string[]): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (folders.some((folder) => normalized === folder || normalized.startsWith(`${folder.replace(/\/$/, "")}/`))) return true;
  return patterns.some((pattern) => { try { return new RegExp(pattern, "i").test(normalized); } catch { return false; } });
}
