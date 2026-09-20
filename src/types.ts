export type EventKind = "point" | "span" | "approximate" | "uncertain";
export type GroupBy = "none" | "folder" | "tag" | "property";

export interface TimelineSettings {
  dateProperties: string[];
  contentPatterns: string[];
  eraLabels: Record<string, number>;
  ignoredFolders: string[];
  ignoredPatterns: string[];
  groupBy: GroupBy;
  defaultZoom: number;
  maxEvents: number;
  onboardingComplete: boolean;
  cache: Record<string, CachedNote>;
  namedViews: NamedView[];
  constanceDeviceId: string;
  billingEmail: string;
  billingAccessToken: string;
  billingAccountLinked: boolean;
  freeUsesDate: string;
  freeUsesToday: number;
  purchasedUses: number;
  pendingSpendEvents: Array<{ eventId: string; amount: number }>;
}

export interface NamedView {
  name: string;
  search: string;
  folder: string;
  tag: string;
  kind: string;
  uncertainty: string;
  from: string;
  to: string;
  groupBy: GroupBy;
}

export interface CachedNote {
  mtime: number;
  size: number;
  settingsHash: string;
  events: TimelineEvent[];
  review: ReviewItem[];
}

export interface TimelineEvent {
  id: string;
  sourcePath: string;
  title: string;
  heading?: string;
  block?: string;
  start: number;
  end: number;
  startLabel: string;
  endLabel?: string;
  precision: "day" | "month" | "year" | "decade" | "era" | "unknown";
  kind: EventKind;
  approximate: boolean;
  uncertain: boolean;
  openEnded: boolean;
  sourceProperty?: string;
  tags: string[];
  folder: string;
  description?: string;
}

export interface ReviewItem {
  path: string;
  title: string;
  reason: "undated" | "unparseable" | "conflicting";
  raw?: string;
  detail: string;
}

export interface ParseResult {
  events: TimelineEvent[];
  review: ReviewItem[];
}

export interface ParsedDate {
  timestamp: number;
  label: string;
  precision: TimelineEvent["precision"];
  approximate: boolean;
  year: number;
}
