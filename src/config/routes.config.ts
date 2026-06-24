/**
 * Centralized navigation routes for VeriDraw.
 */
export const ROUTES = {
  DASHBOARD: '/',
  CREATE_EVENT: '/create',
  QUICK_DRAW: '/quick-draw',
  DRAW_ROOM: (slugOrId: string) => `/draw/${slugOrId}`,
  DRAW_ROOM_PATTERN: '/draw/:slugOrId',
  LOGIN: '/login',
  PROFILE: '/profile',
} as const;
