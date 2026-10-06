import type { TimelineEvent, ReviewItem } from "./types";

export type TimelineMode = "note" | "combined" | "per-note";
export const OUTPUT_START = "<!-- meridian-timeline:start -->";
export const OUTPUT_END = "<!-- meridian-timeline:end -->";
export const GENERATED_NOTE = "<!-- meridian-timeline:generated-note -->";

/** Compare authored content without counting our appended section or line-ending changes. */
export function timelineSourceText(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/<!-- meridian-timeline:start -->[\s\S]*?<!-- meridian-timeline:end -->/g, "").trimEnd();
}

/** Blank generated sections while retaining source offsets and navigation lines. */
export function sourceWithoutTimeline(source: string): string {
  let start = source.indexOf(OUTPUT_START);
  while (start >= 0) {
    const end = source.indexOf(OUTPUT_END, start);
    const stop = end < 0 ? source.length : end + OUTPUT_END.length;
    source = source.slice(0, start) + source.slice(start, stop).replace(/[^\r\n]/g, " ") + source.slice(stop);
    start = source.indexOf(OUTPUT_START, stop);
  }
  return source;
}

const cell = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;").replace(/\r?\n/g, "<br>").replace(/[\\`*_\[\]]/g, "\\$&");

export function timelineMarkdown(events: TimelineEvent[], review: ReviewItem[], mode: TimelineMode, paths: string[], destination = ""): string {
  const lines = [OUTPUT_START, "## Meridian Timeline", "", mode === "combined" ? "Combined timeline · note dates and file last-modified timestamps (UTC)." : "Timeline from dates and events within this note.", "", `Source notes: ${paths.length}. Events: ${events.length}.`, ""];
  if (events.length) {
    lines.push("| Date / range | Type | Event and source |", "| --- | --- | --- |");
    for (const event of [...events].sort((a, b) => a.start - b.start || a.title.localeCompare(b.title))) {
      const date = event.startLabel + (event.endLabel ? ` → ${event.endLabel}` : event.openEnded ? " → ongoing" : "");
      const from = destination.split("/").slice(0, -1);
      const to = event.sourcePath.split("/");
      while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
      const href = "<" + [...from.map(() => ".."), ...to].map(encodeURIComponent).join("/") + ">";
      const type = event.sourceProperty === "file-modified" ? "🟣 Modified" : event.uncertain ? "🟡 Uncertain" : event.approximate ? "🟠 Approximate" : event.kind === "span" || event.endLabel || event.openEnded ? "🟢 Span" : "🔵 Event";
      const sourceName = event.sourcePath.split("/").pop() ?? event.sourcePath;
      const description = event.description && event.description !== event.title && !/^\d{4}-\d{2}-\d{2}\s+[—–-]\s+/.test(event.description) ? `<br>${cell(event.description)}` : "";
      const displayDate = event.sourceProperty === "file-modified" ? `${cell(event.startLabel.slice(0, 10))}<br>${cell(event.startLabel.slice(11, 16))} UTC` : cell(date);
      lines.push(`| ${displayDate} | ${type} | ${cell(event.title)}<br>[${cell(sourceName)}](${href})${description} |`);
    }
  } else lines.push("No supported dates or events were found in this note.");
  if (review.length) {
    lines.push("", "### Review", "");
    for (const item of review) lines.push(`- ${cell(item.path)}: ${cell(item.detail)}`);
  }
  lines.push("", OUTPUT_END);
  return lines.join("\n");
}

/** Update only our marked section; never rewrite unrelated note content. */
export function appendTimeline(source: string, markdown: string): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const block = markdown.replace(/\r?\n/g, newline);
  const start = source.indexOf(OUTPUT_START);
  if (start >= 0) {
    const end = source.indexOf(OUTPUT_END, start);
    if (end < 0) throw new Error("The saved Meridian section has no end marker. Repair its markers before saving again.");
    return source.slice(0, start) + block + source.slice(end + OUTPUT_END.length);
  }
  return source + (source.endsWith(newline + newline) ? "" : source.endsWith(newline) ? newline : newline + newline) + block + newline;
}

export function modifiedEvent(path: string, mtime: number): TimelineEvent {
  const label = new Date(mtime).toISOString();
  return { id: `modified:${path}:${mtime}`, sourcePath: path, title: path.split("/").pop()?.replace(/\.md$/i, "") ?? path, start: mtime, end: mtime, startLabel: label, precision: "day", kind: "point", approximate: false, uncertain: false, openEnded: false, sourceProperty: "file-modified", tags: [], folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "" };
}

export function timelineJson(events: TimelineEvent[], review: ReviewItem[], mode: TimelineMode, paths: string[], scopeRoots: string[] | null = paths): string {
  return JSON.stringify({ format: "meridian-timeline", version: 1, mode, scopeRoots, sourcePaths: paths, events, review }, null, 2) + "\n";
}
