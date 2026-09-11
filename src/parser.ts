import type { ParseResult, ParsedDate, ReviewItem, TimelineEvent } from "./types";

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8,
  sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function utc(year: number, month = 0, day = 1): number {
  return Date.UTC(year, month, day);
}

function validDate(year: number, month: number, day: number): boolean {
  const timestamp = utc(year, month, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
}

function clean(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ").trim();
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function yearFor(value: number): number { return new Date(value).getUTCFullYear(); }

export function stableId(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `meridian-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function parseDateValue(input: unknown, eras: Record<string, number> = {}): ParsedDate | null {
  let text = clean(input);
  if (!text) return null;
  const unknownRaw = text.match(/^(\d{4})[-/](?:xx|x{2}|\?{2})$/i);
  if (unknownRaw) {
    const year = Number(unknownRaw[1]);
    return { timestamp: utc(year), label: text, precision: "unknown", approximate: true, year };
  }
  const approximate = /^(?:about|around|circa|c\.?|ca\.?|~)\s*/i.test(text) || /\?\s*$/.test(text);
  text = text.replace(/^(?:about|around|circa|c\.?|ca\.?|~)\s*/i, "").replace(/\?\s*$/, "").trim();
  const eraKey = Object.keys(eras).find((key) => key.toLowerCase() === text.toLowerCase());
  if (eraKey) {
    const year = eras[eraKey];
    return { timestamp: utc(year), label: eraKey, precision: "era", approximate: true, year };
  }
  const decade = text.match(/^(\d{3})0s$/i);
  if (decade) {
    const year = Number(decade[1]) * 10;
    return { timestamp: utc(year), label: `${year}s`, precision: "decade", approximate: true, year };
  }
  const yearOnly = text.match(/^(\d{1,4})(?:\s*(BC|BCE|AD|CE))?$/i);
  if (yearOnly) {
    const year = Number(yearOnly[1]) * (yearOnly[2] && /BC|BCE/i.test(yearOnly[2]) ? -1 : 1);
    return { timestamp: utc(year), label: text, precision: "year", approximate, year };
  }
  const isoMonth = text.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) {
    const year = Number(isoMonth[1]);
    const month = Number(isoMonth[2]) - 1;
    return month >= 0 && month < 12 ? { timestamp: utc(year, month), label: text, precision: "month", approximate, year } : null;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    const year = Number(iso[1]);
    const timestamp = utc(year, Number(iso[2]) - 1, Number(iso[3]));
    return validDate(year, Number(iso[2]) - 1, Number(iso[3])) ? { timestamp, label: text, precision: "day", approximate, year } : null;
  }
  const named = text.match(/^(\d{1,2})[\s/-]+([A-Za-z]+)[\s,/-]+(\d{1,4})$/) ?? text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{1,4})$/);
  if (named) {
    const dayFirst = /^\d/.test(named[1]);
    const day = Number(dayFirst ? named[1] : named[2]);
    const month = MONTHS[(dayFirst ? named[2] : named[1]).toLowerCase()];
    const year = Number(dayFirst ? named[3] : named[3]);
    if (month !== undefined && validDate(year, month, day)) return { timestamp: utc(year, month, day), label: text, precision: "day", approximate, year };
  }
  const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numeric) {
    const year = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
    const month = Number(numeric[2]) - 1;
    const day = Number(numeric[1]);
    if (month >= 0 && month < 12 && validDate(year, month, day)) return { timestamp: utc(year, month, day), label: text, precision: "day", approximate, year };
  }
  return null;
}

function parseRange(input: unknown, eras: Record<string, number>): { start: ParsedDate; end: ParsedDate } | null {
  const text = clean(input);
  const match = text.match(/^(.+?)\s+(?:to|through|until|–|—)\s+(.+)$/i) ?? text.match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = parseDateValue(match[1], eras); const end = parseDateValue(match[2], eras);
  return start && end ? { start, end } : null;
}

function parseFrontmatter(source: string): { values: Record<string, unknown>; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { values: {}, body: source };
  const values: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([^:#][^:]*):\s*(.*)$/);
    if (!item) continue;
    const key = item[1].trim();
    const value = item[2].trim();
    values[key] = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1).split(",").map((part) => part.trim()) : value;
  }
  return { values, body: source.slice(match[0].length) };
}

function headingAt(body: string, index: number): string | undefined {
  const before = body.slice(0, index).split(/\r?\n/).reverse().find((line) => /^#{1,6}\s+/.test(line));
  return before?.replace(/^#{1,6}\s+/, "").trim();
}

function titleFor(path: string, frontmatter: Record<string, unknown>): string {
  return clean(frontmatter.title) || path.split("/").pop()?.replace(/\.md$/i, "") || path;
}

function folderFor(path: string): string { return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""; }

function tagsFor(frontmatter: Record<string, unknown>, body: string): string[] {
  const raw = [frontmatter.tags, ...(body.match(/(^|\s)#[-\w/]+/g) ?? [])];
  return [...new Set(raw.flatMap((value) => clean(value).split(/[\s,]+/).map((tag) => tag.replace(/^#/, "")).filter(Boolean)))];
}

function makeEvent(path: string, title: string, tags: string[], raw: string, start: ParsedDate, end: ParsedDate | null, property?: string, heading?: string, block?: string): TimelineEvent {
  const openEnded = !end;
  const spanEnd = end?.timestamp ?? start.timestamp;
  const uncertain = start.precision === "unknown" || (end ? end.precision === "unknown" : false);
  const approximate = start.approximate || Boolean(end?.approximate) || start.precision === "year" || start.precision === "decade" || start.precision === "era";
  return {
    id: stableId([path, property ?? "content", raw, start.timestamp, spanEnd, heading ?? "", block ?? ""].join("|")),
    sourcePath: path, title, heading, block, start: start.timestamp, end: spanEnd,
    startLabel: start.label, endLabel: end?.label, precision: start.precision,
    kind: uncertain ? "uncertain" : openEnded ? (approximate ? "approximate" : "point") : (approximate ? "approximate" : "span"),
    approximate, uncertain, openEnded, sourceProperty: property, tags, folder: folderFor(path),
  };
}

export function parseNote(path: string, source: string, dateProperties: string[], contentPatterns: string[] = [], eras: Record<string, number> = {}): ParseResult {
  const { values, body } = parseFrontmatter(source);
  const title = titleFor(path, values);
  const tags = tagsFor(values, body);
  const events: TimelineEvent[] = [];
  const review: ReviewItem[] = [];
  const candidates: Array<{ value: unknown; property: string }> = [];
  const startProperties = [...new Set(["start", "date", ...dateProperties.filter((property) => property !== "end")])];
  let startValue: unknown;
  let startProperty = "date";
  for (const property of startProperties) {
    if (values[property] === undefined) continue;
    if (startValue === undefined) startValue = values[property];
    const parsed = parseDateValue(values[property], eras);
    if (parsed) { startValue = values[property]; startProperty = property; break; }
    review.push({ path, title, reason: "unparseable", raw: clean(values[property]), detail: `Could not parse frontmatter property “${property}”.` });
  }
  const endValue = values.end;
  if (startValue !== undefined) candidates.push({ value: startValue, property: startProperty });
  let structuredStart: ParsedDate | null = null;
  let structuredEnd: ParsedDate | null = null;
  if (candidates.length) {
    const range = parseRange(candidates[0].value, eras);
    structuredStart = range?.start ?? parseDateValue(candidates[0].value, eras);
    structuredEnd = range?.end ?? (endValue === undefined ? null : parseDateValue(endValue, eras));
    if (!structuredStart) review.push({ path, title, reason: "unparseable", raw: clean(candidates[0].value), detail: `Could not parse frontmatter property “${candidates[0].property}”.` });
    else {
      if (endValue !== undefined && !structuredEnd) review.push({ path, title, reason: "unparseable", raw: clean(endValue), detail: "Could not parse the end property." });
      events.push(makeEvent(path, title, tags, `${clean(candidates[0].value)}-${clean(endValue)}`, structuredStart, structuredEnd, candidates[0].property));
    }
  }
  const matches = [...body.matchAll(/(?:\b(?:on|from|to|in|circa|around)\s+)?(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}|\d{4}s|\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{1,4}|[A-Za-z]+\s+\d{1,2},?\s+\d{1,4})/gi)];
  for (const match of matches.slice(0, 50)) {
    if (structuredStart && Math.abs((match.index ?? 0) - body.indexOf(clean(candidates[0]?.value))) < 4) continue;
    const parsed = parseDateValue(match[1], eras);
    if (!parsed) continue;
    const start = match.index ?? 0;
    const near = body.slice(start, start + 120);
    const range = near.match(/^(?:[^\n]*?)(?:-|–|—|to)\s*(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}|\d{4}s|\d{4})/i);
    const end = range ? parseDateValue(range[1], eras) : null;
    events.push(makeEvent(path, title, tags, match[0], parsed, end, undefined, headingAt(body, start), `line:${body.slice(0, start).split(/\r?\n/).length}`));
  }
  for (const pattern of contentPatterns) {
    try {
      const regex = new RegExp(pattern, "gi");
      for (const match of body.matchAll(regex)) {
        const raw = match[1] ?? match[0];
        const parsed = parseDateValue(raw, eras);
        if (parsed) events.push(makeEvent(path, title, tags, raw, parsed, null, "content", headingAt(body, match.index ?? 0), `line:${body.slice(0, match.index ?? 0).split(/\r?\n/).length}`));
        else review.push({ path, title, reason: "unparseable", raw, detail: `Content pattern “${pattern}” matched text that is not a supported date.` });
      }
    } catch { review.push({ path, title, reason: "unparseable", detail: `Invalid content pattern “${pattern}”.` }); }
  }
  const unique = [...new Map(events.map((event) => [event.id, event])).values()];
  if (unique.length === 0 && review.length === 0) review.push({ path, title, reason: "undated", detail: "No configured date property or supported date in content." });
  if (unique.length > 1 && structuredStart && unique.some((event) => event.start !== structuredStart?.timestamp)) {
    review.push({ path, title, reason: "conflicting", detail: "Frontmatter and content contain different dates; both are shown." });
    unique.forEach((event) => { event.uncertain = true; event.kind = "uncertain"; });
  }
  return { events: unique, review };
}

export function settingsHash(settings: Pick<import("./types").TimelineSettings, "dateProperties" | "contentPatterns" | "eraLabels">): string {
  return stableId(JSON.stringify({
    dateProperties: settings.dateProperties,
    contentPatterns: settings.contentPatterns,
    eraLabels: settings.eraLabels,
  }));
}
