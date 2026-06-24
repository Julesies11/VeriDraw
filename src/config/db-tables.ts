/**
 * Centralized database table names.
 * All tables are prefixed with 'vd_' as per project standards.
 */
export const TABLES = {
  EVENTS: 'vd_events',
  EVENT_ITEMS: 'vd_event_items',
  EVENT_SESSIONS: 'vd_event_sessions',
  PROFILES: 'vd_profiles',
  ERROR_LOGS: 'vd_error_logs',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
