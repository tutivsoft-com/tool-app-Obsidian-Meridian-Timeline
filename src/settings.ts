import type { TimelineSettings } from "./types";

export const DEFAULT_SETTINGS: TimelineSettings = {
  dateProperties: ["date", "start", "end", "created", "modified"],
  contentPatterns: [],
  eraLabels: { "early modern": 1500, "industrial revolution": 1760, "world war i": 1914, "world war ii": 1939 },
  ignoredFolders: [".obsidian", "templates"],
  ignoredPatterns: [],
  groupBy: "folder",
  defaultZoom: 1,
  maxEvents: 5000,
  onboardingComplete: false,
  cache: {},
  namedViews: [],
};

