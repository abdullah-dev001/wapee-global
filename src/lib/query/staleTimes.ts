const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * staleTime presets by data type (CLAUDE.md §6). Pick one per query; never inline numbers.
 * - static: services, staff, settings, roles, plan
 * - list: clients, invoices and other paginated lists
 * - live: calendar, today (pair with Realtime invalidation)
 */
export const staleTimes = {
  static: 5 * MINUTE,
  staticLong: 10 * MINUTE,
  list: 30 * SECOND,
  listLong: 60 * SECOND,
  live: 0,
  liveShort: 15 * SECOND,
} as const;

export type StaleTimePreset = keyof typeof staleTimes;

/** How long unused data stays in memory. */
export const DEFAULT_GC_TIME = 5 * MINUTE;
