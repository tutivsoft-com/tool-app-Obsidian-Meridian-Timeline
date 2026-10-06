import type { GroupBy, TimelineEvent } from "./types";

/** Choose distinct labels with enough horizontal room for full dates. */
export function axisTicks(min: number, range: number, width: number): Array<{ position: number; label: string }> {
  const short = range < 366 * 86400000;
  const intervals = Math.max(1, Math.min(6, Math.floor(width / 120), short ? Math.floor(range / 86400000) : 6));
  const ticks: Array<{ position: number; label: string }> = [];
  for (let i = 0; i <= intervals; i++) {
    if (i > 0 && width < 240) break;
    const date = new Date(min + range * i / intervals);
    const year = date.getUTCFullYear();
    const label = short ? date.toISOString().slice(0, 10) : year < 0 ? `${Math.abs(year)} BCE` : String(year);
    if (!ticks.some(tick => tick.label === label)) ticks.push({ position: i / intervals * width, label });
  }
  return ticks;
}

/** Allocate rows using visible bar widths, then offset each group to avoid overlap. */
export function layoutEvents(events: TimelineEvent[], groupBy: GroupBy, range: number, width = 900, minimumWidth = 0): Array<{ event: TimelineEvent; lane: number }> {
  const groups = new Map<string, { ends: number[]; rows: Array<{ event: TimelineEvent; lane: number }> }>();
  for (const event of events) {
    const key = groupBy === "folder" ? event.folder : groupBy === "tag" ? event.tags[0] ?? "" : groupBy === "property" ? event.sourceProperty ?? "Content" : "";
    let group = groups.get(key);
    if (!group) { group = { ends: [], rows: [] }; groups.set(key, group); }
    const end = Math.max(event.end, event.start + 86400000, event.start + range * Math.max(.012, minimumWidth / width));
    let lane = group.ends.findIndex(value => value <= event.start);
    if (lane < 0) { lane = group.ends.length; group.ends.push(end); } else group.ends[lane] = end;
    group.rows.push({ event, lane });
  }
  const rows: Array<{ event: TimelineEvent; lane: number }> = [];
  let offset = 0;
  for (const group of groups.values()) {
    rows.push(...group.rows.map(row => ({ event: row.event, lane: row.lane + offset })));
    offset += group.ends.length;
  }
  return rows;
}
